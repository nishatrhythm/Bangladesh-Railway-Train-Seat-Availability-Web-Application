import threading, time, uuid, queue, random
from typing import Dict, Any, Optional, Callable
from datetime import datetime, timedelta
from collections import deque, OrderedDict

class RequestQueue:
    def __init__(self, max_concurrent=1, cooldown_period=3, batch_cleanup_threshold=10, cleanup_interval=30, heartbeat_timeout=60):
        self.queue = queue.Queue()
        self.results = {}
        self.statuses = {}
        self.max_concurrent = max_concurrent
        self.cooldown_period = cooldown_period
        self.active_requests = 0
        self.lock = threading.Lock()
        self.last_request_time = None
        
        self.queue_order = OrderedDict()
        self.cancelled_requests = set()
        
        self.requests = {}
        self.processing_history = deque(maxlen=50)
        self.abandonment_history = deque(maxlen=100)
        self.avg_processing_time = 8.0
        self.cleanup_interval = cleanup_interval
        self.last_cleanup = time.time()
        self.batch_cleanup_threshold = batch_cleanup_threshold
        self.heartbeat_timeout = heartbeat_timeout
        
        self.worker_thread = threading.Thread(target=self._process_queue)
        self.worker_thread.daemon = True
        self.worker_thread.start()
        
        self.enhanced_cleanup_thread = threading.Thread(target=self._enhanced_cleanup_loop)
        self.enhanced_cleanup_thread.daemon = True
        self.enhanced_cleanup_thread.start()
    
    def add_request(self, request_func, params):
        request_id = str(uuid.uuid4())
        current_time = datetime.now()
        
        with self.lock:
            self.queue.put((request_id, request_func, params))
            queue_size = self.queue.qsize()
            
            self.queue_order[request_id] = current_time
            
            self.requests[request_id] = {
                'request_func': request_func,
                'params': params,
                'timestamp': time.time(),
                'last_heartbeat': time.time()
            }
            
            self.statuses[request_id] = {
                "status": "queued",
                "position": queue_size,
                "created_at": current_time,
                "estimated_time": self._enhanced_estimate_wait_time(queue_size),
                "last_heartbeat": time.time()
            }
        return request_id
    
    def _enhanced_estimate_wait_time(self, position):
        base_time = self.avg_processing_time + (self.cooldown_period / self.max_concurrent)
        
        predicted_abandonments = self._predict_abandonments(position)
        effective_position = max(1, position - predicted_abandonments)
        
        batch = (effective_position // self.max_concurrent)
        position_in_batch = effective_position % self.max_concurrent
        
        if position_in_batch == 0:
            position_in_batch = self.max_concurrent
            batch -= 1
            
        wait_time = (batch * self.cooldown_period) + (position_in_batch * base_time)
        return max(1, int(wait_time))
    
    def _predict_abandonments(self, current_position):
        if not self.abandonment_history or current_position <= 1:
            return 0
        
        recent_time = time.time() - 1800
        recent_abandonments = [a for a in self.abandonment_history if a['timestamp'] > recent_time]
        
        if len(recent_abandonments) < 5:
            return 0
        
        abandonment_rate = min(0.2, len(recent_abandonments) / max(10, current_position))
        return int(current_position * abandonment_rate * 0.5)
    
    def update_heartbeat(self, request_id):
        with self.lock:
            current_time = time.time()
            if request_id in self.statuses:
                self.statuses[request_id]["last_heartbeat"] = current_time
            if request_id in self.requests:
                self.requests[request_id]["last_heartbeat"] = current_time
                return True
        return False
    
    def get_request_status(self, request_id):
        with self.lock:
            if request_id in self.statuses:
                status_data = self.statuses[request_id].copy()
                
                if status_data["status"] == "queued":
                    position = self._get_fast_position(request_id)
                    status_data["position"] = position
                    status_data["estimated_time"] = self._enhanced_estimate_wait_time(position)
                elif status_data["status"] == "processing":
                    status_data["position"] = 0
                    status_data["estimated_time"] = 0
                return status_data
            return None
    
    def _get_fast_position(self, request_id):
        if request_id not in self.queue_order:
            return 0
        
        position = 1
        target_time = self.queue_order[request_id]
        
        for rid, timestamp in self.queue_order.items():
            if timestamp < target_time and rid not in self.cancelled_requests:
                position += 1
            elif rid == request_id:
                break
        
        return position
    
    def get_request_result(self, request_id):
        with self.lock:
            if request_id in self.results:
                result = self.results[request_id]
                del self.results[request_id]
                del self.statuses[request_id]
                return result
            return None
    
    def cancel_request(self, request_id):
        with self.lock:
            removed = False
            
            if request_id in self.statuses:
                self.cancelled_requests.add(request_id)
                status = self.statuses[request_id]
                
                if status["status"] == "queued":
                    abandonment_data = {
                        'position': status.get("position", 0),
                        'wait_time': time.time() - status["created_at"].timestamp(),
                        'timestamp': time.time()
                    }
                    self.abandonment_history.append(abandonment_data)
                
                del self.statuses[request_id]
                removed = True
            
            if request_id in self.results:
                del self.results[request_id]
            
            if request_id in self.requests:
                del self.requests[request_id]
            
            if request_id in self.queue_order:
                del self.queue_order[request_id]
            
            if len(self.cancelled_requests) >= self.batch_cleanup_threshold:
                self._batch_remove_cancelled()
            
            return removed
    
    def _batch_remove_cancelled(self):
        if not self.cancelled_requests:
            return
        
        temp_queue = queue.Queue()
        removed_count = 0
        
        while not self.queue.empty():
            try:
                item = self.queue.get_nowait()
                if item[0] not in self.cancelled_requests:
                    temp_queue.put(item)
                else:
                    removed_count += 1
            except queue.Empty:
                break
        
        self.queue = temp_queue
        self.cancelled_requests.clear()
        
        if removed_count > 0:
            print(f"Batch cleanup: Removed {removed_count} cancelled requests from queue")
    
    def _process_queue(self):
        while True:
            batch = []
            with self.lock:
                if self.cancelled_requests:
                    self._batch_remove_cancelled()
                
                if self.last_request_time and (datetime.now() - self.last_request_time) < timedelta(seconds=self.cooldown_period):
                    time_to_wait = (self.last_request_time + timedelta(seconds=self.cooldown_period) - datetime.now()).total_seconds()
                    if time_to_wait > 0:
                        self.lock.release()
                        time.sleep(time_to_wait)
                        self.lock.acquire()
                
                while len(batch) < self.max_concurrent and not self.queue.empty():
                    item = self.queue.get()
                    request_id = item[0]
                    
                    if request_id in self.cancelled_requests:
                        self.cancelled_requests.discard(request_id)
                        continue
                    
                    if request_id in self.statuses:
                        batch.append(item)
                        self.statuses[request_id]["status"] = "processing"
                        self.queue_order.pop(request_id, None)
                
                if batch:
                    self.last_request_time = datetime.now()
            
            for request_id, request_func, params in batch:
                start_time = time.time()
                
                with self.lock:
                    if request_id not in self.statuses:
                        continue
                
                try:
                    max_retries = 3
                    retry_count = 0
                    retry_delay = 5
                    
                    while retry_count < max_retries:
                        with self.lock:
                            if request_id not in self.statuses:
                                break
                        
                        try:
                            result = request_func(**params)
                            break
                        except Exception as e:
                            if "Rate limit exceeded" in str(e) or "403" in str(e):
                                retry_count += 1
                                if retry_count < max_retries:
                                    retry_delay_with_jitter = retry_delay + (retry_count * 2) + (random.random() * 2)
                                    time.sleep(retry_delay_with_jitter)
                                    continue
                            raise
                    
                    end_time = time.time()
                    processing_time = end_time - start_time
                    self.processing_history.append(processing_time)
                    
                    if self.processing_history:
                        self.avg_processing_time = sum(self.processing_history) / len(self.processing_history)
                    
                    with self.lock:
                        if request_id in self.statuses:
                            self.results[request_id] = result
                            self.statuses[request_id]["status"] = "completed"
                except Exception as e:
                    with self.lock:
                        if request_id in self.statuses:
                            self.results[request_id] = {"error": str(e)}
                            self.statuses[request_id]["status"] = "failed"
            
            if not batch:
                time.sleep(1)
                self._cleanup_old_entries()
    
    def _cleanup_old_entries(self):
        with self.lock:
            current_time = datetime.now()
            expired_ids = []
            
            for request_id, status in self.statuses.items():
                if status["status"] in ["completed", "failed"] and "created_at" in status:
                    time_diff = current_time - status["created_at"]
                    if time_diff.total_seconds() > 1800:
                        expired_ids.append(request_id)
            
            for request_id in expired_ids:
                if request_id in self.results:
                    del self.results[request_id]
                if request_id in self.statuses:
                    del self.statuses[request_id]
                if request_id in self.queue_order:
                    del self.queue_order[request_id]
    
    def _enhanced_cleanup_loop(self):
        while True:
            time.sleep(self.cleanup_interval)
            self._enhanced_cleanup()
            with self.lock:
                if self.cancelled_requests:
                    self._batch_remove_cancelled()
    
    def _enhanced_cleanup(self):
        current_time = time.time()
        stale_requests = []
        
        with self.lock:
            for request_id, status in self.statuses.items():
                if status["status"] == "queued":
                    last_heartbeat = status.get("last_heartbeat", 0)
                    if current_time - last_heartbeat > self.heartbeat_timeout:
                        stale_requests.append(request_id)
        
        for request_id in stale_requests:
            self.cancel_request(request_id)
        
        if stale_requests:
            print(f"Enhanced cleanup: Removed {len(stale_requests)} stale requests")
    
    def force_cleanup(self):
        with self.lock:
            if self.cancelled_requests:
                self._batch_remove_cancelled()
        self._enhanced_cleanup()
        self._cleanup_old_entries()
    
    def get_queue_stats(self):
        with self.lock:
            total_queued = sum(1 for s in self.statuses.values() if s["status"] == "queued")
            total_processing = sum(1 for s in self.statuses.values() if s["status"] == "processing")
            recent_abandonments = len([a for a in self.abandonment_history 
                                      if time.time() - a['timestamp'] < 3600])
            
            return {
                "queued": total_queued,
                "processing": total_processing,
                "avg_processing_time": round(self.avg_processing_time, 2),
                "recent_abandonments": recent_abandonments,
                "queue_size": self.queue.qsize(),
                "cancelled_pending": len(self.cancelled_requests)
            }

request_queue = RequestQueue()