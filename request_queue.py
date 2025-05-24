import threading, time, uuid, queue, random
from typing import Dict, Any, Optional, Callable
from datetime import datetime, timedelta

class RequestQueue:
    def __init__(self, max_concurrent=1, cooldown_period=3):
        self.queue = queue.Queue()
        self.results = {}
        self.statuses = {}
        self.max_concurrent = max_concurrent
        self.cooldown_period = cooldown_period
        self.active_requests = 0
        self.lock = threading.Lock()
        self.last_request_time = None
        self.worker_thread = threading.Thread(target=self._process_queue)
        self.worker_thread.daemon = True
        self.worker_thread.start()
    
    def add_request(self, request_func, params):
        request_id = str(uuid.uuid4())
        with self.lock:
            self.queue.put((request_id, request_func, params))
            self.statuses[request_id] = {
                "status": "queued",
                "position": self.queue.qsize(),
                "created_at": datetime.now(),
                "estimated_time": self._estimate_wait_time(self.queue.qsize())
            }
        return request_id
    
    def _estimate_wait_time(self, position):
        avg_request_time = 5 + (self.cooldown_period / self.max_concurrent)
        batch = (position // self.max_concurrent)
        position_in_batch = position % self.max_concurrent
        
        if position_in_batch == 0:
            position_in_batch = self.max_concurrent
            batch -= 1
            
        wait_time = (batch * self.cooldown_period) + (position_in_batch * avg_request_time)
        return int(wait_time)
    
    def get_request_status(self, request_id):
        with self.lock:
            if request_id in self.statuses:
                status_data = self.statuses[request_id].copy()
                
                if status_data["status"] == "queued":
                    position = 0
                    for i, (rid, _, _) in enumerate(list(self.queue.queue)):
                        if rid == request_id:
                            position = i + 1
                            break
                    status_data["position"] = position
                    status_data["estimated_time"] = self._estimate_wait_time(position)
                elif status_data["status"] == "processing":
                    status_data["position"] = 0
                    status_data["estimated_time"] = 0
                return status_data
            return None
    
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
            if request_id in self.statuses:
                del self.statuses[request_id]
            
            if request_id in self.results:
                del self.results[request_id]
            
            temp_queue = queue.Queue()
            removed = False
            
            while not self.queue.empty():
                try:
                    item = self.queue.get_nowait()
                    if item[0] != request_id:
                        temp_queue.put(item)
                    else:
                        removed = True
                except queue.Empty:
                    break
            
            self.queue = temp_queue
            
            return removed
    
    def _process_queue(self):
        while True:
            batch = []
            with self.lock:
                if self.last_request_time and (datetime.now() - self.last_request_time) < timedelta(seconds=self.cooldown_period):
                    time_to_wait = (self.last_request_time + timedelta(seconds=self.cooldown_period) - datetime.now()).total_seconds()
                    if time_to_wait > 0:
                        self.lock.release()
                        time.sleep(time_to_wait)
                        self.lock.acquire()
                
                while len(batch) < self.max_concurrent and not self.queue.empty():
                    item = self.queue.get()
                    request_id = item[0]
                    if request_id in self.statuses:
                        batch.append(item)
                        self.statuses[request_id]["status"] = "processing"
                
                if batch:
                    self.last_request_time = datetime.now()
            
            for request_id, request_func, params in batch:
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

request_queue = RequestQueue()