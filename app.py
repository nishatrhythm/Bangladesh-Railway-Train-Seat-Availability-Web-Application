from flask import Flask, render_template, request, redirect, url_for, make_response, abort, session, after_this_request, jsonify
from detailsSeatAvailability import main as detailsSeatAvailability, sort_seat_number
from datetime import datetime, timedelta
import requests, os, json, uuid, pytz, base64, re, logging, sys
from request_queue import RequestQueue

app = Flask(__name__)
app.secret_key = "your_secret_key"
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=30)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

RESULT_CACHE = {}

def is_android_device():
    # user_agent = request.headers.get('User-Agent', '').lower()
    
    # if any(ios_pattern in user_agent for ios_pattern in ['iphone', 'ipad', 'ipod', 'ios']):
    #     return False
    
    # if 'android' in user_agent:
    #     logger.info(f"Android detected via User-Agent: {request.headers.get('User-Agent', '')}")
    #     return True
    
    # if ('mobile' in user_agent or 'tablet' in user_agent) and 'safari' not in user_agent:
    #     logger.info(f"Android detected via User-Agent (mobile/tablet): {request.headers.get('User-Agent', '')}")
    #     return True
    
    # ua_platform = request.headers.get('Sec-CH-UA-Platform', '').lower()
    # ua_mobile = request.headers.get('Sec-CH-UA-Mobile', '').lower()
    
    # if 'android' in ua_platform:
    #     logger.info(f"Android detected via Client Hints - Platform: {ua_platform}, Mobile: {ua_mobile}")
    #     return True
    
    # if ua_mobile == '?1' and 'ios' not in ua_platform and 'safari' not in user_agent:
    #     logger.info(f"Android detected via Client Hints - Mobile: {ua_mobile}")
    #     return True
    
    # mobile_headers = [
    #     'X-Requested-With',
    #     'X-WAP-Profile',
    # ]
    
    # for header in mobile_headers:
    #     header_value = request.headers.get(header, '').lower()
    #     if 'android' in header_value or 'mobile' in header_value:
    #         logger.info(f"Android detected via {header} header: {header_value}")
    #         return True
    
    # accept_header = request.headers.get('Accept', '').lower()
    # if 'wap' in accept_header or 'mobile' in accept_header:
    #     logger.info(f"Android detected via Accept header: {accept_header}")
    #     return True
    
    # client_detection = request.headers.get('X-Client-Android-Detection', '')
    # if client_detection == 'true':
    #     touch_points = request.headers.get('X-Client-Touch-Points', '0')
    #     screen_size = request.headers.get('X-Client-Screen-Size', 'unknown')
    #     pixel_ratio = request.headers.get('X-Client-Pixel-Ratio', '1')
    #     logger.info(f"Android detected via client-side JS - Touch: {touch_points}, Screen: {screen_size}, DPI: {pixel_ratio}")
    #     return True
    
    # if 'firefox' in user_agent:
    #     session_android_detected = session.get('confirmed_android_device', False)
    #     if session_android_detected:
    #         logger.info("Android detected via session memory (Firefox desktop mode bypass detected)")
    #         return True
    
    # if 'chrome' in user_agent and 'linux' in user_agent:
    #     session_android_detected = session.get('confirmed_android_device', False)
    #     if session_android_detected:
    #         logger.info("Android detected via session memory (desktop mode bypass detected)")
    #         return True
    
    return False

def get_user_device_info():
    user_agent = request.headers.get('User-Agent', '')
    
    if any(mobile in user_agent.lower() for mobile in ['mobile', 'android', 'iphone', 'ipad', 'tablet']):
        device_type = 'Mobile'
    else:
        device_type = 'PC'
    
    browser = 'Unknown'
    user_agent_lower = user_agent.lower()
    
    if 'chrome' in user_agent_lower and 'edge' not in user_agent_lower and 'opr' not in user_agent_lower:
        browser = 'Chrome'
    elif 'firefox' in user_agent_lower:
        browser = 'Firefox'
    elif 'safari' in user_agent_lower and 'chrome' not in user_agent_lower:
        browser = 'Safari'
    elif 'edge' in user_agent_lower:
        browser = 'Edge'
    elif 'opera' in user_agent_lower or 'opr' in user_agent_lower:
        browser = 'Opera'
    elif 'msie' in user_agent_lower or 'trident' in user_agent_lower:
        browser = 'Internet Explorer'
    
    return device_type, browser

with open('config.json', 'r', encoding='utf-8') as config_file:
    CONFIG = json.load(config_file)

with open('assets/js/script.js', 'r', encoding='utf-8') as js_file:
    SCRIPT_JS_CONTENT = js_file.read()
with open('assets/styles.css', 'r', encoding='utf-8') as css_file:
    STYLES_CSS_CONTENT = css_file.read()

default_banner_path = 'assets/images/sample_banner.png'
DEFAULT_BANNER_IMAGE = ""
if os.path.exists(default_banner_path):
    try:
        with open(default_banner_path, 'rb') as img_file:
            encoded_image = base64.b64encode(img_file.read()).decode('utf-8')
            DEFAULT_BANNER_IMAGE = f"data:image/png;base64,{encoded_image}"
    except Exception as e:
        pass

instruction_image_path = 'assets/images/instruction.png'
DEFAULT_INSTRUCTION_IMAGE = ""
if os.path.exists(instruction_image_path):
    try:
        with open(instruction_image_path, 'rb') as img_file:
            encoded_image = base64.b64encode(img_file.read()).decode('utf-8')
            DEFAULT_INSTRUCTION_IMAGE = f"data:image/png;base64,{encoded_image}"
    except Exception:
        pass

mobile_instruction_image_path = 'assets/images/mobile_instruction.png'
DEFAULT_MOBILE_INSTRUCTION_IMAGE = ""
if os.path.exists(mobile_instruction_image_path):
    try:
        with open(mobile_instruction_image_path, 'rb') as img_file:
            encoded_image = base64.b64encode(img_file.read()).decode('utf-8')
            DEFAULT_MOBILE_INSTRUCTION_IMAGE = f"data:image/png;base64,{encoded_image}"
    except Exception:
        pass

with open('stations_en.json', 'r', encoding='utf-8') as stations_file:
    STATIONS_DATA = json.load(stations_file).get('stations', [])

def configure_request_queue():
    max_concurrent = CONFIG.get("queue_max_concurrent", 1)
    cooldown_period = CONFIG.get("queue_cooldown_period", 3)
    batch_cleanup_threshold = CONFIG.get("queue_batch_cleanup_threshold", 10)
    cleanup_interval = CONFIG.get("queue_cleanup_interval", 30)
    heartbeat_timeout = CONFIG.get("queue_heartbeat_timeout", 90)
    
    return RequestQueue(
        max_concurrent=max_concurrent, 
        cooldown_period=cooldown_period,
        batch_cleanup_threshold=batch_cleanup_threshold,
        cleanup_interval=cleanup_interval,
        heartbeat_timeout=heartbeat_timeout
    )

request_queue = configure_request_queue()

def block_android_from_route():
    blocked_routes = ['/', '/check_seats', '/queue_wait', '/show_results', '/queue_status']
    
    if request.endpoint and request.path in blocked_routes:
        if is_android_device():
            admin_bypass = session.get('isAdmin', False)
            if not admin_bypass:
                return True
    return False

@app.before_request
def android_route_blocker():
    
    allowed_paths = ['/android', '/ads.txt', '/cancel_request', 
                     '/cancel_request_beacon', '/queue_heartbeat', '/queue_cleanup', '/queue_stats',
                     '/test-android-detection', '/clear-android-session', '/admin']
    
    path_allowed = any(request.path.startswith(path) for path in allowed_paths)
    
    if not path_allowed and block_android_from_route():
        redirect_attempted = session.get('android_redirect_attempted', False)
        if not redirect_attempted:
            session['android_redirect_attempted'] = True
            return redirect(url_for('android'))
        else:
            logger.warning(f"Android device accessing {request.path} after redirect attempt - allowing to prevent infinite loop")
            return None

@app.before_request
def filter_cloudflare_requests():
    if request.path.startswith('/cdn-cgi/'):
        return '', 404

@app.after_request
def add_cache_control_headers(response):
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, post-check=0, pre-check=0, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

def check_maintenance():
    if CONFIG.get("is_maintenance", 0):
        return render_template(
            'notice.html',
            message=CONFIG.get("maintenance_message", ""),
            styles_css=STYLES_CSS_CONTENT,
            script_js=SCRIPT_JS_CONTENT
        )
    return None

@app.route('/ads.txt')
def ads_txt():
    try:
        with open('ads.txt', 'r', encoding='utf-8') as f:
            content = f.read()
        response = make_response(content)
        response.headers['Content-Type'] = 'text/plain'
        return response
    except FileNotFoundError:
        abort(404)

@app.route('/android')
def android():
    maintenance_response = check_maintenance()
    if maintenance_response:
        return maintenance_response
    
    if not is_android_device():
        return redirect(url_for('home'))
    
    admin_bypass = session.get('isAdmin', False)
    if admin_bypass:
        return redirect(url_for('home'))
    
    session['confirmed_android_device'] = True
    session.pop('android_redirect_attempted', None)
    
    app_version = CONFIG.get("version", "1.0.0")
    config = CONFIG.copy()
    
    android_message = ("Sorry, this service is currently not available for Android devices. "
                      "Please use a desktop or laptop computer to access our train seat availability service. "
                      "We apologize for any inconvenience.")
    
    return render_template(
        'android.html',
        message=android_message,
        app_version=app_version,
        CONFIG=config,
        is_banner_enabled=CONFIG.get("is_banner_enabled", 0),
        styles_css=STYLES_CSS_CONTENT,
        script_js=SCRIPT_JS_CONTENT
    )

@app.route('/test-android-detection')
def test_android_detection():
    android_detected = is_android_device()
    user_agent = request.headers.get('User-Agent', '')
    
    detection_info = {
        'android_detected': android_detected,
        'user_agent': user_agent,
        'headers': dict(request.headers),
        'would_be_blocked': block_android_from_route() if request.path in ['/', '/check_seats'] else False,
        'blocking_always_enabled': True
    }
    
    return jsonify(detection_info)

@app.route('/clear-android-session')
def clear_android_session():
    session.pop('android_redirect_attempted', None)
    session.pop('confirmed_android_device', None)
    
    return jsonify({
        'message': 'Android session flags cleared',
        'cleared_flags': ['android_redirect_attempted', 'confirmed_android_device']
    })

@app.route('/admin')
def admin():
    maintenance_response = check_maintenance()
    if maintenance_response:
        return maintenance_response
    
    if not is_android_device():
        return redirect(url_for('home'))
    
    app_version = CONFIG.get("version", "1.0.0")
    config = CONFIG.copy()
    
    return render_template(
        'admin.html',
        app_version=app_version,
        CONFIG=config,
        styles_css=STYLES_CSS_CONTENT,
        script_js=SCRIPT_JS_CONTENT
    )

@app.route('/admin/verify', methods=['POST'])
def admin_verify():
    if not is_android_device():
        return jsonify({'error': 'Access denied'}), 403
    
    data = request.get_json()
    admin_code = data.get('code', '').strip()
    
    valid_admin_code = os.environ.get('ADMIN_ACCESS_CODE')
    
    if valid_admin_code and admin_code == valid_admin_code:
        session.permanent = True
        session['isAdmin'] = True
        logger.info("Admin access granted successfully")
        return jsonify({'success': True, 'message': 'Admin access granted'})
    elif not valid_admin_code:
        logger.warning("Admin access verification failed - Admin code not configured")
        return jsonify({'error': 'Admin access is not configured'}), 400
    else:
        logger.warning("Admin access verification failed - Invalid admin code")
        return jsonify({'error': 'Invalid admin code'}), 401

@app.route('/admin/remove', methods=['POST'])
def admin_remove():
    if not is_android_device():
        return jsonify({'error': 'Access denied'}), 403
    
    session.pop('isAdmin', None)
    return jsonify({'success': True, 'message': 'Admin access removed'})

@app.route('/admin/status')
def admin_status():
    if not is_android_device():
        return jsonify({'error': 'Access denied'}), 403
    
    admin_active = session.get('isAdmin', False)
    admin_configured = bool(os.environ.get('ADMIN_ACCESS_CODE'))
    
    return jsonify({
        'admin_active': admin_active,
        'admin_configured': admin_configured
    })

@app.route('/admin/sync', methods=['GET', 'POST'])
def admin_sync():
    if request.method == 'GET':
        abort(404)
    
    if not is_android_device():
        return jsonify({'error': 'Access denied'}), 403
    
    data = request.get_json()
    client_admin_active = data.get('admin_active', False)
    
    server_admin_active = session.get('isAdmin', False)
    
    if client_admin_active and not server_admin_active:
        logger.info("Admin sync rejected - server session expired, client localStorage should be cleared")
        return jsonify({'success': False, 'synced': False, 'session_expired': True})
    elif client_admin_active and server_admin_active:
        session.permanent = True
        session['isAdmin'] = True
        return jsonify({'success': True, 'synced': True})
    else:
        session.pop('isAdmin', None)
        return jsonify({'success': True, 'synced': True})

@app.route('/')
def home():
    maintenance_response = check_maintenance()
    if maintenance_response:
        return maintenance_response

    error = session.pop('error', None)
    form_values = session.pop('form_values', None)

    if form_values and form_values.get('date'):
        try:
            datetime.strptime(form_values['date'], '%d-%b-%Y')
        except ValueError:
            form_values['date'] = ''

    bst_tz = pytz.timezone('Asia/Dhaka')
    bst_now = datetime.now(bst_tz)
    min_date = bst_now.replace(hour=0, minute=0, second=0, microsecond=0)
    max_date = min_date + timedelta(days=10)
    bst_midnight_utc = min_date.astimezone(pytz.UTC).strftime('%Y-%m-%dT%H:%M:%SZ')

    banner_image = CONFIG.get("image_link") or DEFAULT_BANNER_IMAGE
    if not banner_image:
        banner_image = ""

    return render_template(
        'index.html',
        error=error,
        form_values=form_values,
        min_date=min_date.strftime('%Y-%m-%d'),
        max_date=max_date.strftime('%Y-%m-%d'),
        bst_midnight_utc=bst_midnight_utc,
        stations=STATIONS_DATA,
        app_version=CONFIG.get("version", "1.0.0"),
        is_banner_enabled=CONFIG.get("is_banner_enabled", 0),
        banner_image=banner_image,
        instruction_image=DEFAULT_INSTRUCTION_IMAGE,
        mobile_instruction_image=DEFAULT_MOBILE_INSTRUCTION_IMAGE,
        CONFIG=CONFIG,
        styles_css=STYLES_CSS_CONTENT,
        script_js=SCRIPT_JS_CONTENT
    )

def process_seat_request(origin, destination, formatted_date, form_values, auth_token, device_key):
    try:
        if not auth_token or not device_key:
            return {"error": "AUTH_CREDENTIALS_REQUIRED"}
        
        config = {
            'from_city': origin,
            'to_city': destination,
            'date_of_journey': formatted_date,
            'seat_class': 'S_CHAIR',
            'auth_token': auth_token,
            'device_key': device_key
        }
        result = detailsSeatAvailability(config)
        
        if not result or "error" in result:
            return {"error": result.get("error", "No data received. Please try a different criteria.")}

        bst_tz = pytz.timezone('Asia/Dhaka')
        for train, details in result.items():
            details['from_station'] = config['from_city']
            details['to_station'] = config['to_city']
            details['journey_duration'] = calculate_journey_duration(details['departure_time'], details['arrival_time'])
            train_has_422_error = False
            train_error_message = None
            for seat_type in details['seat_data']:
                if seat_type.get("is_422") and "error_info" in seat_type:
                    train_has_422_error = True
                    error_info = seat_type["error_info"]
                    message = error_info.get("message", "")
                    error_key = error_info.get("errorKey", "")
                    if error_key == "OrderLimitExceeded" and train_error_message is None:
                        train_error_message = f"Please retry with a different account as you have reached the maximum order limit for this train on the selected day."
                    elif train_error_message is None:
                        train_error_message = "Please retry with a different account to get seat info for this train."
                seat_type['grouped_seats'] = group_by_prefix(seat_type['available_seats'])
                seat_type['grouped_booking_process'] = group_by_prefix(seat_type['booking_process_seats'])

                issued_seats = []
                for type_id in [1, 3]:
                    if type_id in seat_type['ticket_types']:
                        issued_seats.extend(seat_type['ticket_types'][type_id].get('seats', []))
                issued_seats = sorted(issued_seats, key=sort_seat_number)
                grouped_issued = group_by_prefix(issued_seats)
                seat_type['grouped_ticket_types'] = {
                    t: group_by_prefix(info['seats']) for t, info in seat_type.get('ticket_types', {}).items()
                    if 'seats' in info
                }

                seat_type['ticket_types']['issued_combined'] = {
                    'label': 'Issued Tickets to Buy',
                    'seats': issued_seats,
                    'count': len(issued_seats),
                    'grouped': grouped_issued
                }
                if train_error_message:
                    seat_type["error_message"] = train_error_message
            if train_has_422_error and all(st["is_422"] for st in details['seat_data']):
                details["all_seats_422"] = True
            else:
                details["all_seats_422"] = False

        return {"success": True, "result": result, "form_values": form_values}
    except Exception as e:
        return {"error": str(e)}

def calculate_journey_duration(departure_time, arrival_time):
    try:
        dep_dt = datetime.strptime(departure_time, '%d %b, %I:%M %p')
        arr_dt = datetime.strptime(arrival_time, '%d %b, %I:%M %p')
        
        if arr_dt < dep_dt:
            arr_dt = arr_dt.replace(year=arr_dt.year + 1) if arr_dt.month == 12 and arr_dt.day == 31 else arr_dt + timedelta(days=1)
        
        duration = arr_dt - dep_dt
        hours = int(duration.total_seconds() // 3600)
        minutes = int((duration.total_seconds() % 3600) // 60)
        
        return f"{hours}h {minutes}m"
    except:
        return "N/A"

@app.route('/check_seats', methods=['GET', 'POST'])
def check_seats():
    maintenance_response = check_maintenance()
    if maintenance_response:
        return maintenance_response

    if request.method == 'GET':
        abort(404)

    try:
        form_values = {
            'origin': request.form.get('origin', ''),
            'destination': request.form.get('destination', ''),
            'date': request.form.get('date', '')
        }

        if not form_values['origin'] or not form_values['destination'] or not form_values['date']:
            session['error'] = "Origin, Destination, and Journey Date are required."
            return redirect(url_for('home'))

        session['form_values'] = form_values

        device_type, browser = get_user_device_info()
        logger.info(f"Seat Availability Request - Origin: '{form_values['origin']}', Destination: '{form_values['destination']}', Date: '{form_values['date']}', Device: '{device_type}', Browser: '{browser}'")

        raw_date = form_values['date']
        try:
            formatted_date = datetime.strptime(raw_date, '%d-%b-%Y').strftime('%d-%b-%Y')
        except ValueError:
            session['error'] = "Invalid date format submitted. Please choose a date again."
            return redirect(url_for('home'))

        if CONFIG.get("queue_enabled", True):
            request_id = request_queue.add_request(
                process_seat_request,
                {
                    'origin': form_values['origin'],
                    'destination': form_values['destination'],
                    'formatted_date': formatted_date,
                    'form_values': form_values,
                    'auth_token': request.form.get('auth_token', ''),
                    'device_key': request.form.get('device_key', '')
                }
            )
            session['queue_request_id'] = request_id
            return redirect(url_for('queue_wait'))
        else:
            auth_token = request.form.get('auth_token', '')
            device_key = request.form.get('device_key', '')
            
            if not auth_token or not device_key:
                session['error'] = "AUTH_CREDENTIALS_REQUIRED"
                return redirect(url_for('home'))
            
            config = {
                'from_city': form_values['origin'],
                'to_city': form_values['destination'],
                'date_of_journey': formatted_date,
                'seat_class': 'S_CHAIR',
                'auth_token': auth_token,
                'device_key': device_key
            }

            result = detailsSeatAvailability(config)

            bst_tz = pytz.timezone('Asia/Dhaka')

            if "error" in result:
                if result["error"] == "No trains found for the given criteria.":
                    session['error'] = "At this moment, no trains are found between your selected origin and destination stations on the selected day. Please retry with a different criteria."
                    return redirect(url_for('home'))
                elif result["error"] == "422 error occurred for all trains":
                    details = result.get("details", {})
                    for train, train_details in details.items():
                        for seat_type in train_details["seat_data"]:
                            if seat_type["is_422"] and "error_info" in seat_type:
                                error_info = seat_type["error_info"]
                                message = error_info.get("message", "")
                                error_key = error_info.get("errorKey", "")
                                if "ticket purchase for this trip will be available" in message or "East Zone" in message or "West Zone" in message:
                                    time_match = re.search(r'(\d+:\d+\s*[APMapm]+)', message)
                                    retry_time = time_match.group(1) if time_match else "8:00 AM or 2:00 PM"
                                    session['error'] = f"Ticket purchasing for the selected criteria is not yet available, so seat info cannot be fetched at this moment. Please try again after {retry_time}. Alternatively, search for a different day."
                                    return redirect(url_for('home'))
                                elif "Your purchase process is on-going" in message:
                                    time_match = re.search(r'(\d+)\s*minute[s]?\s*(\d+)\s*second[s]?', message, re.IGNORECASE)
                                    minutes = int(time_match.group(1))
                                    seconds = int(time_match.group(2))
                                    total_seconds = minutes * 60 + seconds
                                    retry_time = (datetime.now(bst_tz) + timedelta(seconds=total_seconds)).strftime('%I:%M:%S %p')
                                    session['error'] = f"Your purchase process for some tickets is ongoing for this account, so seat info cannot be fetched at this moment. Please try again after {retry_time} or retry with a different account."
                                    return redirect(url_for('home'))
                                elif "Multiple order attempt detected" in message:
                                    time_match = re.search(r'(\d+)\s*minute[s]?\s*(\d+)\s*second[s]?', message, re.IGNORECASE)
                                    minutes = int(time_match.group(1))
                                    seconds = int(time_match.group(2))
                                    total_seconds = minutes * 60 + seconds
                                    retry_time = (datetime.now(bst_tz) + timedelta(seconds=total_seconds)).strftime('%I:%M:%S %p')
                                    session['error'] = f"You already have an active reservation process in this account, so seat info cannot be fetched at this moment. Please try again after {retry_time} or retry with a different account."
                                    return redirect(url_for('home'))
                                elif error_key == "OrderLimitExceeded":
                                    session['error'] = "Please retry with a different account as you have reached the maximum order limit for all trains between your chosen stations on the selected day, so seat info cannot be fetched at this moment. Alternatively, search for a different day."
                                    return redirect(url_for('home'))
                    session['error'] = "An error occurred while fetching seat details. Please retry with a different account for the given criteria."
                    return redirect(url_for('home'))

            for train, details in result.items():
                details['from_station'] = config['from_city']
                details['to_station'] = config['to_city']
                details['journey_duration'] = calculate_journey_duration(details['departure_time'], details['arrival_time'])
                train_has_422_error = False
                train_error_message = None
                for seat_type in details['seat_data']:
                    if seat_type["is_422"] and "error_info" in seat_type:
                        train_has_422_error = True
                        error_info = seat_type["error_info"]
                        message = error_info.get("message", "")
                        error_key = error_info.get("errorKey", "")
                        if error_key == "OrderLimitExceeded" and train_error_message is None:
                            train_error_message = f"Please retry with a different account as you have reached the maximum order limit for this train on the selected day, so seat info cannot be fetched at this moment."
                        elif train_error_message is None:
                            train_error_message = "Please retry with a different account to get seat info for this train."
                    seat_type['grouped_seats'] = group_by_prefix(seat_type['available_seats'])
                    seat_type['grouped_booking_process'] = group_by_prefix(seat_type['booking_process_seats'])

                    issued_seats = []
                    for type_id in [1, 3]:
                        if type_id in seat_type['ticket_types']:
                            issued_seats.extend(seat_type['ticket_types'][type_id].get('seats', []))
                    issued_seats = sorted(issued_seats, key=sort_seat_number)
                    grouped_issued = group_by_prefix(issued_seats)
                    seat_type['grouped_ticket_types'] = {
                        t: group_by_prefix(info['seats']) for t, info in seat_type.get('ticket_types', {}).items()
                        if 'seats' in info
                    }

                    seat_type['ticket_types']['issued_combined'] = {
                        'label': 'Issued Tickets to Buy',
                        'seats': issued_seats,
                        'count': len(issued_seats),
                        'grouped': grouped_issued
                    }
                    if train_error_message:
                        seat_type["error_message"] = train_error_message
                if train_has_422_error and all(st["is_422"] for st in details['seat_data']):
                    details["all_seats_422"] = True
                else:
                    details["all_seats_422"] = False

            result_id = str(uuid.uuid4())
            RESULT_CACHE[result_id] = result
            session['result_id'] = result_id
            return redirect(url_for('show_results'))

    except Exception as e:
        session['error'] = str(e)
        return redirect(url_for('home'))

@app.route('/queue_wait')
def queue_wait():
    maintenance_response = check_maintenance()
    if maintenance_response:
        return maintenance_response
    
    request_id = session.get('queue_request_id')
    if not request_id:
        session['error'] = "Your request session has expired. Please search again."
        return redirect(url_for('home'))
    
    status = request_queue.get_request_status(request_id)
    if not status:
        session['error'] = "Your request could not be found. Please search again."
        return redirect(url_for('home'))
    
    if request.args.get('refresh_check') == 'true':
        request_queue.cancel_request(request_id)
        session.pop('queue_request_id', None)
        session['error'] = "Page was refreshed. Please start a new search."
        return redirect(url_for('home'))
    
    form_values = session.get('form_values', {})
    
    return render_template(
        'queue.html',
        request_id=request_id,
        status=status,
        form_values=form_values,
        styles_css=STYLES_CSS_CONTENT,
        script_js=SCRIPT_JS_CONTENT
    )

@app.route('/queue_status/<request_id>')
def queue_status(request_id):
    status = request_queue.get_request_status(request_id)
    if not status:
        return jsonify({"error": "Request not found"}), 404
    
    if status["status"] == "failed":
        result = request_queue.get_request_result(request_id)
        if result and "error" in result:
            status["errorMessage"] = result["error"]
    
    return jsonify(status)

@app.route('/cancel_request/<request_id>', methods=['POST'])
def cancel_request(request_id):
    try:
        removed = request_queue.cancel_request(request_id)
        
        if session.get('queue_request_id') == request_id:
            session.pop('queue_request_id', None)
        
        stats = request_queue.get_queue_stats()
        if stats.get('cancelled_pending', 0) > 5:
            request_queue.force_cleanup()
        
        return jsonify({"cancelled": removed, "status": "success"})
    except Exception as e:
        return jsonify({"cancelled": False, "status": "error", "error": str(e)}), 500

@app.route('/cancel_request_beacon/<request_id>', methods=['POST'])
def cancel_request_beacon(request_id):
    try:
        request_queue.cancel_request(request_id)
        return '', 204
    except Exception:
        return '', 204

@app.route('/queue_heartbeat/<request_id>', methods=['POST'])
def queue_heartbeat(request_id):
    try:
        updated = request_queue.update_heartbeat(request_id)
        return jsonify({"status": "success", "active": updated})
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500

@app.route('/show_results')
def show_results():
    maintenance_response = check_maintenance()
    if maintenance_response:
        return maintenance_response

    result_id = session.pop('result_id', None)
    if not result_id or result_id not in RESULT_CACHE:
        if session.get('queue_request_id'):
            return redirect(url_for('show_results_with_id', request_id=session['queue_request_id']))
        return redirect(url_for('home'))

    result = RESULT_CACHE.pop(result_id)

    form_values = session.get('form_values', {})
    origin = form_values.get('origin', '')
    destination = form_values.get('destination', '')

    raw_date = form_values.get('date', '')
    if raw_date:
        try:
            formatted_date = datetime.strptime(raw_date, '%d-%b-%Y').strftime('%d-%b-%Y')
            journey_year = datetime.strptime(raw_date, '%d-%b-%Y').year
        except ValueError:
            formatted_date = ''
            journey_year = datetime.now().year
    else:
        formatted_date = ''
        journey_year = datetime.now().year

    seat_class = 'S_CHAIR'

    if result:
        def parse_departure_time(item):
            dep_time_str = item[1].get('departure_time', '')
            if not dep_time_str:
                return datetime.max
            full_date_str = f"{dep_time_str} {journey_year}"
            try:
                return datetime.strptime(full_date_str, '%d %b, %I:%M %p %Y')
            except ValueError:
                return datetime.max

        result = dict(sorted(result.items(), key=parse_departure_time))

    @after_this_request
    def add_headers(response):
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, post-check=0, pre-check=0, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        return response

    banner_image = CONFIG.get("image_link") or DEFAULT_BANNER_IMAGE
    if not banner_image:
        banner_image = ""

    return render_template(
        'results.html',
        result=result,
        origin=origin,
        destination=destination,
        date=formatted_date,
        seat_class=seat_class,
        styles_css=STYLES_CSS_CONTENT,
        script_js=SCRIPT_JS_CONTENT,
        banner_image=banner_image
    )

@app.route('/show_results/<request_id>')
def show_results_with_id(request_id):
    maintenance_response = check_maintenance()
    if maintenance_response:
        return maintenance_response

    queue_result = request_queue.get_request_result(request_id)
    
    if not queue_result:
        session['error'] = "Your request has expired or could not be found. Please search again."
        return redirect(url_for('home'))
    
    if "error" in queue_result:
        session['error'] = queue_result["error"]
        return redirect(url_for('home'))
    
    if not queue_result.get("success"):
        session['error'] = "An error occurred while processing your request. Please try again."
        return redirect(url_for('home'))
    
    result = queue_result.get("result", {})
    form_values = queue_result.get("form_values", {})
    
    if session.get('queue_request_id') == request_id:
        session.pop('queue_request_id', None)

    origin = form_values.get('origin', '')
    destination = form_values.get('destination', '')
    raw_date = form_values.get('date', '')
    
    if raw_date:
        try:
            formatted_date = datetime.strptime(raw_date, '%d-%b-%Y').strftime('%d-%b-%Y')
            journey_year = datetime.strptime(raw_date, '%d-%b-%Y').year
        except ValueError:
            formatted_date = ''
            journey_year = datetime.now().year
    else:
        formatted_date = ''
        journey_year = datetime.now().year

    seat_class = 'S_CHAIR'

    if result:
        def parse_departure_time(item):
            dep_time_str = item[1].get('departure_time', '')
            if not dep_time_str:
                return datetime.max
            full_date_str = f"{dep_time_str} {journey_year}"
            try:
                return datetime.strptime(full_date_str, '%d %b, %I:%M %p %Y')
            except ValueError:
                return datetime.max

        result = dict(sorted(result.items(), key=parse_departure_time))

    banner_image = CONFIG.get("image_link") or DEFAULT_BANNER_IMAGE
    if not banner_image:
        banner_image = ""

    return render_template(
        'results.html',
        result=result,
        origin=origin,
        destination=destination,
        date=formatted_date,
        seat_class=seat_class,
        styles_css=STYLES_CSS_CONTENT,
        script_js=SCRIPT_JS_CONTENT,
        banner_image=banner_image
    )

@app.route('/queue_stats')
def queue_stats():
    try:
        stats = request_queue.get_queue_stats()
        return jsonify(stats)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/queue_cleanup', methods=['POST'])
def queue_cleanup():
    try:
        request_queue.force_cleanup()
        stats = request_queue.get_queue_stats()
        return jsonify({"status": "success", "message": "Cleanup completed", "stats": stats})
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500

@app.errorhandler(404)
def page_not_found(e):
    maintenance_response = check_maintenance()
    if maintenance_response:
        return maintenance_response
    return render_template('404.html', styles_css=STYLES_CSS_CONTENT, script_js=SCRIPT_JS_CONTENT), 404

def group_by_prefix(seats):
    groups = {}
    for seat in seats:
        prefix = seat.split('-')[0]
        groups.setdefault(prefix, []).append(seat)
    return {prefix: {"seats": seats, "count": len(seats)} for prefix, seats in groups.items()}

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=int(os.environ.get("PORT", 5001)), debug=False)
else:
    if not app.debug:
        app.logger.setLevel(logging.INFO)
        app.logger.addHandler(logging.StreamHandler(sys.stdout))