from flask import Flask, render_template, request, redirect, url_for, make_response, abort, session, after_this_request
from detailsSeatAvailability import main as detailsSeatAvailability, set_token
from datetime import datetime, timedelta
import requests, os, json, uuid, pytz, base64, re

app = Flask(__name__)
app.secret_key = "your_secret_key"

RESULT_CACHE = {}
TOKEN_API_URL = "https://railspaapi.shohoz.com/v1.0/app/auth/sign-in"
STATION_NAME_MAPPING = {"Coxs Bazar": "Cox's Bazar"}

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

with open('stations_en.json', 'r', encoding='utf-8') as stations_file:
    STATIONS_DATA = json.load(stations_file).get('stations', [])

@app.before_request
def filter_cloudflare_requests():
    if request.path.startswith('/cdn-cgi/'):
        return '', 404

def fetch_token(phone_number, password):
    payload = {"mobile_number": phone_number, "password": password}
    max_retries = 3
    retry_count = 0

    while retry_count < max_retries:
        try:
            response = requests.post(TOKEN_API_URL, json=payload)
            if response.status_code == 422:
                raise Exception("Mobile Number or Password is incorrect.")
            elif response.status_code >= 500:
                retry_count += 1
                if retry_count == max_retries:
                    raise Exception("We're facing a problem with the Bangladesh Railway website. Please try again in a few minutes.")
                continue
            data = response.json()
            token = data["data"]["token"]
            return token
        except requests.RequestException as e:
            error_str = str(e)
            if "NameResolutionError" in error_str or "Failed to resolve" in error_str:
                raise Exception("We couldn't reach the Bangladesh Railway website. Please try again in a few minutes.")
            raise Exception(f"Failed to fetch token: {error_str}")

@app.after_request
def add_cache_control_headers(response):
    if 'set-cookie' in response.headers:
        return response
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, post-check=0, pre-check=0, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

def check_maintenance():
    if CONFIG.get("is_maintenance", 0):
        return render_template('notice.html', message=CONFIG.get("maintenance_message", ""), styles_css=STYLES_CSS_CONTENT, script_js=SCRIPT_JS_CONTENT)
    return None

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

    token = request.cookies.get('token')
    show_disclaimer = token is None

    bst_tz = pytz.timezone('Asia/Dhaka')
    bst_now = datetime.now(bst_tz)
    min_date = bst_now.replace(hour=0, minute=0, second=0, microsecond=0)
    max_date = min_date + timedelta(days=10)
    bst_midnight_utc = min_date.astimezone(pytz.UTC).strftime('%Y-%m-%dT%H:%M:%SZ')

    banner_image = CONFIG.get("image_link") or DEFAULT_BANNER_IMAGE
    if not banner_image:
        pass

    return render_template(
        'index.html',
        token=token,
        error=error,
        form_values=form_values,
        show_disclaimer=show_disclaimer,
        min_date=min_date.strftime('%Y-%m-%d'),
        max_date=max_date.strftime('%Y-%m-%d'),
        bst_midnight_utc=bst_midnight_utc,
        stations=STATIONS_DATA,
        app_version=CONFIG.get("version", "1.0.0"),
        is_banner_enabled=CONFIG.get("is_banner_enabled", 0),
        banner_image=banner_image,
        CONFIG=CONFIG,
        styles_css=STYLES_CSS_CONTENT,
        script_js=SCRIPT_JS_CONTENT
    )

@app.route('/check_seats', methods=['GET', 'POST'])
def check_seats():
    maintenance_response = check_maintenance()
    if maintenance_response:
        return maintenance_response

    if request.method == 'GET':
        abort(404)
    try:
        form_values = {
            'phone_number': request.form.get('phone_number', ''),
            'origin': request.form.get('origin', ''),
            'destination': request.form.get('destination', ''),
            'date': request.form.get('date', '')
        }

        form_values['origin'] = STATION_NAME_MAPPING.get(form_values['origin'], form_values['origin'])
        form_values['destination'] = STATION_NAME_MAPPING.get(form_values['destination'], form_values['destination'])

        session['form_values'] = form_values

        token = request.cookies.get('token')

        if not token:
            phone_number = request.form.get('phone_number')
            password = request.form.get('password')

            if not phone_number or not password:
                error = "Session expired. Please log in again."
                session['error'] = error
                return redirect(url_for('home'))

            try:
                token = fetch_token(phone_number, password)
            except Exception as e:
                error = str(e)
                session['error'] = error
                return redirect(url_for('home'))

            @after_this_request
            def set_cookie(response):
                response.set_cookie('token', token, httponly=True, secure=True, samesite='Lax')
                return response

            set_token(token)
        else:
            set_token(token)

        raw_date = request.form['date']
        try:
            formatted_date = datetime.strptime(raw_date, '%d-%b-%Y').strftime('%d-%b-%Y')
        except ValueError:
            session['error'] = "Invalid date format submitted. Please choose a date again."
            return redirect(url_for('home'))

        config = {
            'from_city': form_values['origin'],
            'to_city': form_values['destination'],
            'date_of_journey': formatted_date,
            'seat_class': 'S_CHAIR'
        }

        result = detailsSeatAvailability(config)

        if "error" in result:
            if result["error"] == "No trains found for the given criteria.":
                session['error'] = result["error"]
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
                                retry_time = (datetime.now() + timedelta(seconds=total_seconds)).strftime('%I:%M:%S %p')
                                session['error'] = f"Your purchase process for some tickets is ongoing for this account, so seat info cannot be fetched at this moment. Please try again after {retry_time} or retry with a different account."
                                return redirect(url_for('home'))
                            elif "Multiple order attempt detected" in message:
                                time_match = re.search(r'(\d+)\s*minute[s]?\s*(\d+)\s*second[s]?', message, re.IGNORECASE)
                                minutes = int(time_match.group(1))
                                seconds = int(time_match.group(2))
                                total_seconds = minutes * 60 + seconds
                                retry_time = (datetime.now() + timedelta(seconds=total_seconds)).strftime('%I:%M:%S %p')
                                session['error'] = f"You already have an active reservation process in this account, so seat info cannot be fetched at this moment. Please try again after {retry_time} or retry with a different account."
                                return redirect(url_for('home'))
                            elif error_key == "OrderLimitExceeded":
                                session['error'] = "Please retry with a different account as you have reached the maximum order limit for the selected day, so seat info cannot be fetched at this moment. Alternatively, search for a different day."
                                return redirect(url_for('home'))
                session['error'] = "An error occurred while fetching seat details. Please retry with a different account for the given criteria."
                return redirect(url_for('home'))

        for train, details in result.items():
            details['from_station'] = config['from_city']
            details['to_station'] = config['to_city']

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
        error_msg = str(e)
        if "Token expired" in error_msg or "unauthorized" in error_msg.lower():
            @after_this_request
            def clear_cookie(response):
                response.delete_cookie('token')
                return response
            error = "Authorization token expired. Please log in again."
        else:
            error = f"An unexpected error occurred: {error_msg}"
        session['error'] = error
        return redirect(url_for('home'))

@app.route('/show_results')
def show_results():
    maintenance_response = check_maintenance()
    if maintenance_response:
        return maintenance_response

    result_id = session.pop('result_id', None)
    if not result_id or result_id not in RESULT_CACHE:
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
        pass

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

@app.route('/clear_token', methods=['GET', 'POST'])
def clear_token():
    maintenance_response = check_maintenance()
    if maintenance_response:
        return maintenance_response

    if request.method == 'GET':
        abort(404)
    response = make_response(redirect(url_for('home')))
    response.delete_cookie('token')
    return response

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
    app.run(host='0.0.0.0', port=int(os.environ.get("PORT", 5000)))