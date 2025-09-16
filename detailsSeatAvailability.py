from typing import Dict, List, Tuple
import requests, os, json
from colorama import Fore, init
from datetime import datetime, timedelta
from dotenv import load_dotenv
from flask import session, request

load_dotenv('/etc/secrets/.env')

init(autoreset=True)

# Load translations data
TRANSLATIONS_DATA = {}
try:
    with open('translations.json', 'r', encoding='utf-8') as f:
        TRANSLATIONS_DATA = json.load(f)
except Exception as e:
    print(f"Error loading translations: {e}")

def get_user_language():
    """Get user's preferred language from session/cookies."""
    try:
        lang = session.get('lang')
        if not lang:
            lang = request.cookies.get('lang', 'en')
        return lang if lang in ['en', 'bn'] else 'en'
    except:
        return 'en'

def translate_error(error_key, lang='en', **kwargs):
    """Translate error messages based on provided language preference."""
    try:
        translation = TRANSLATIONS_DATA.get(lang, {}).get('errors', {}).get(error_key, error_key)
        
        # Replace placeholders if kwargs provided
        if kwargs:
            for key, value in kwargs.items():
                translation = translation.replace(f'{{{key}}}', str(value))
        
        return translation
    except Exception:
        # Fallback to original key if translation fails
        return error_key

def translate_coach_and_seat(text, lang='en'):
    """Translate coach names and seat numbers to Bengali."""
    if lang != 'bn':
        return text
    
    try:
        coach_translations = TRANSLATIONS_DATA.get('bn', {}).get('coach_translations', {})
        
        # Handle cases like "DA-LO-3", "KA-UP-3", "XTR18-UP-55"
        parts = text.split('-')
        translated_parts = []
        
        for part in parts:
            # Check if it's a number
            if part.isdigit():
                # Convert numbers to Bengali digits
                bengali_digits = {'0': '০', '1': '১', '2': '২', '3': '৩', '4': '৪', '5': '৫', '6': '৬', '7': '৭', '8': '৮', '9': '৯'}
                translated_part = ''.join(bengali_digits.get(digit, digit) for digit in part)
                translated_parts.append(translated_part)
            else:
                # Check for exact matches first
                if part in coach_translations:
                    translated_parts.append(coach_translations[part])
                else:
                    # Handle cases like XTR18 (XTR + number)
                    found_translation = False
                    for eng_coach, bengali_coach in coach_translations.items():
                        if part.startswith(eng_coach) and len(part) > len(eng_coach):
                            # Extract the number part
                            number_part = part[len(eng_coach):]
                            if number_part.isdigit():
                                # Convert number to Bengali digits
                                bengali_digits = {'0': '০', '1': '১', '2': '২', '3': '৩', '4': '৪', '5': '৫', '6': '৬', '7': '৭', '8': '৮', '9': '৯'}
                                bengali_number = ''.join(bengali_digits.get(digit, digit) for digit in number_part)
                                translated_parts.append(bengali_coach + bengali_number)
                                found_translation = True
                                break
                    
                    if not found_translation:
                        translated_parts.append(part)
        
        return '-'.join(translated_parts)
    except Exception:
        return text

def translate_ticket_category(category, lang='en'):
    """Translate ticket category labels."""
    if lang != 'bn':
        return category
    
    try:
        ticket_categories = TRANSLATIONS_DATA.get('bn', {}).get('ticket_categories', {})
        return ticket_categories.get(category, category)
    except Exception:
        return category

def translate_seat_type(seat_type, lang='en'):
    """Translate seat type labels."""
    if lang != 'bn':
        return seat_type
    
    try:
        seat_types = TRANSLATIONS_DATA.get('bn', {}).get('seat_types', {})
        return seat_types.get(seat_type, seat_type)
    except Exception:
        return seat_type

def group_seats_by_coach(seats, user_lang='en'):
    """Group seats by coach and translate coach names."""
    grouped = {}
    for seat in seats:
        # Get original coach name for grouping
        original_coach = seat.split('-')[0] if '-' in seat else seat
        
        # Translate the coach name for display
        if user_lang == 'bn':
            translated_coach = translate_coach_and_seat(original_coach, user_lang)
        else:
            translated_coach = original_coach
        
        if translated_coach not in grouped:
            grouped[translated_coach] = {'seats': [], 'count': 0}
        
        # Add the translated seat number
        translated_seat = translate_coach_and_seat(seat, user_lang)
        grouped[translated_coach]['seats'].append(translated_seat)
        grouped[translated_coach]['count'] += 1
    
    return grouped

init(autoreset=True)

API_BASE_URL = 'https://railspaapi.shohoz.com/v1.0'
SEAT_AVAILABILITY = {'AVAILABLE': 1, 'IN_PROCESS': 2}

BANGLA_COACH_ORDER = [
    "KA", "KHA", "GA", "GHA", "UMA", "CHA", "SCHA", "JA", "JHA", "NEO",
    "TA", "THA", "DA", "DHA", "TO", "THO", "DOA", "DANT", "XTR1", "XTR2", "XTR3", "XTR4", "XTR5", "SLR", "STD"
]
COACH_INDEX = {coach: idx for idx, coach in enumerate(BANGLA_COACH_ORDER)}

TOKEN = None
TOKEN_TIMESTAMP = None

def set_token(token: str):
    global TOKEN, TOKEN_TIMESTAMP
    TOKEN = token
    TOKEN_TIMESTAMP = datetime.utcnow()

def fetch_token(user_lang: str = 'en') -> str:
    mobile_number = os.getenv("FIXED_MOBILE_NUMBER")
    password = os.getenv("FIXED_PASSWORD")
    if not mobile_number or not password:
        raise Exception(translate_error("fixed_credentials_not_configured", user_lang))
    url = f"{API_BASE_URL}/app/auth/sign-in"
    payload = {"mobile_number": mobile_number, "password": password}
    max_retries = 2
    retry_count = 0
    while retry_count < max_retries:
        try:
            response = requests.post(url, json=payload)
            if response.status_code == 422:
                raise Exception(translate_error("server_credentials_incorrect", user_lang))
            elif response.status_code >= 500:
                retry_count += 1
                if retry_count == max_retries:
                    raise Exception(translate_error("railway_website_problem", user_lang))
                continue
            data = response.json()
            token = data["data"]["token"]
            return token
        except requests.RequestException as e:
            error_str = str(e)
            if "NameResolutionError" in error_str or "Failed to resolve" in error_str:
                raise Exception(translate_error("connection_failed", user_lang))
            raise Exception(translate_error("fetch_token_failed", user_lang, error=error_str))

def sort_seat_number(seat: str) -> tuple:
    parts = seat.split('-')
    coach = parts[0]
    coach_order = COACH_INDEX.get(coach, len(BANGLA_COACH_ORDER) + 1)
    coach_fallback = coach if coach not in COACH_INDEX else ""
    if len(parts) == 2:
        try:
            return (coach_order, coach_fallback, int(parts[1]), '')
        except ValueError:
            return (coach_order, coach_fallback, 0, parts[1])
    elif len(parts) == 3:
        try:
            return (coach_order, coach_fallback, int(parts[2]), parts[1])
        except ValueError:
            return (coach_order, coach_fallback, 0, parts[1])
    return (len(BANGLA_COACH_ORDER) + 1, seat, 0, '')

def analyze_seat_layout(data: Dict, user_lang: str = 'en') -> Dict:
    layout = data.get("data", {}).get("seatLayout", [])
    if not layout:
        return {}
    seats = {1: [], 2: [], 3: [], 4: []}
    for floor in layout:
        for row in floor["layout"]:
            for seat in row:
                if seat["seat_number"] and seat["ticket_type"] in seats:
                    seats[seat["ticket_type"]].append(seat["seat_number"])
    ticket_types = {}
    for t, label in [(1, "Issued Tickets to Buy"),
                     (3, "Issued Tickets to Buy"),
                     (2, "Soon-to-be-Issued Tickets to Buy"),
                     (4, "Reserved Tickets Under Authority")]:
        if seats[t]:
            sorted_seats = sorted(seats[t], key=sort_seat_number)
            # Translate seat numbers
            translated_seats = [translate_coach_and_seat(seat, user_lang) for seat in sorted_seats]
            # Translate category label
            translated_label = translate_ticket_category(label, user_lang)
            
            ticket_types[t] = {
                "label": translated_label,
                "seats": translated_seats,
                "count": len(sorted_seats)
            }

    ticket_types["issued_total"] = {
        "count": len(seats[1]) + len(seats[3])
    }

    return ticket_types

def get_seat_layout(trip_id: str, trip_route_id: str, user_lang: str = 'en') -> Tuple[List[str], List[str], int, int, bool, dict, dict]:
    global TOKEN
    if not TOKEN:
        TOKEN = fetch_token(user_lang)
        set_token(TOKEN)
    
    url = f"{API_BASE_URL}/app/bookings/seat-layout"
    headers = {"Authorization": f"Bearer {TOKEN}"}
    params = {"trip_id": trip_id, "trip_route_id": trip_route_id}
    max_retries = 2
    retry_count = 0
    has_retried_with_new_token = False

    while retry_count < max_retries:
        try:
            response = requests.get(url, headers=headers, params=params)
            if response.status_code >= 500:
                retry_count += 1
                if retry_count == max_retries:
                    raise Exception(translate_error("connection_error", user_lang))
                continue
            if response.status_code == 401 and not has_retried_with_new_token:
                try:
                    error_data = response.json()
                    error_messages = error_data.get("error", {}).get("messages", [])
                    if isinstance(error_messages, list) and any("Invalid User Access Token!" in msg for msg in error_messages):
                        TOKEN = fetch_token(user_lang)
                        set_token(TOKEN)
                        headers["Authorization"] = f"Bearer {TOKEN}"
                        has_retried_with_new_token = True
                        continue
                except ValueError:
                    TOKEN = fetch_token(user_lang)
                    set_token(TOKEN)
                    headers["Authorization"] = f"Bearer {TOKEN}"
                    has_retried_with_new_token = True
                    continue
            response.raise_for_status()
            data = response.json()
            seat_layout = data.get("data", {}).get("seatLayout", [])

            seats = [(seat["seat_number"], seat["seat_availability"], seat["ticket_type"])
                     for layout in seat_layout
                     for row in layout["layout"]
                     for seat in row]

            available_seats = [num for num, avail, _ in seats if avail == SEAT_AVAILABILITY['AVAILABLE']]
            booking_process_seats = [num for num, avail, ttype in seats 
                                    if avail == SEAT_AVAILABILITY['IN_PROCESS'] and ttype in {1, 2, 3}]

            available_seats_sorted = sorted(available_seats, key=sort_seat_number)
            booking_process_seats_sorted = sorted(booking_process_seats, key=sort_seat_number)
            
            # Translate seat numbers
            available_seats_translated = [translate_coach_and_seat(seat, user_lang) for seat in available_seats_sorted]
            booking_process_seats_translated = [translate_coach_and_seat(seat, user_lang) for seat in booking_process_seats_sorted]

            ticket_types = analyze_seat_layout(data, user_lang)

            return (available_seats_translated, booking_process_seats_translated, len(available_seats), len(booking_process_seats), False, {}, ticket_types)

        except requests.RequestException as e:
            status_code = e.response.status_code if e.response is not None else None
            if status_code == 401 and not has_retried_with_new_token:
                try:
                    error_data = e.response.json()
                    error_messages = error_data.get("error", {}).get("messages", [])
                    if isinstance(error_messages, list) and any("Invalid User Access Token!" in msg for msg in error_messages):
                        TOKEN = fetch_token()
                        set_token(TOKEN)
                        headers["Authorization"] = f"Bearer {TOKEN}"
                        has_retried_with_new_token = True
                        continue
                except ValueError:
                    TOKEN = fetch_token()
                    set_token(TOKEN)
                    headers["Authorization"] = f"Bearer {TOKEN}"
                    has_retried_with_new_token = True
                    continue
            if status_code == 422:
                error_data = e.response.json()
                error_messages = error_data.get("error", {}).get("messages", [])
                error_dict = {"is_422": True}
                if isinstance(error_messages, list) and error_messages:
                    error_dict["message"] = error_messages[0]
                elif isinstance(error_messages, dict):
                    error_dict["message"] = error_messages.get("message", "")
                    error_dict["errorKey"] = error_messages.get("errorKey", "")
                return [], [], 0, 0, True, error_dict, {}
            return [], [], 0, 0, False, {}, {}

def fetch_train_details(config: Dict, user_lang: str = 'en') -> List[Dict]:
    global TOKEN
    if not TOKEN:
        TOKEN = fetch_token(user_lang)
        set_token(TOKEN)

    url = f"{API_BASE_URL}/app/bookings/search-trips-v2"
    headers = {"Authorization": f"Bearer {TOKEN}"}
    max_retries = 2
    retry_count = 0
    has_retried_with_new_token = False

    while retry_count < max_retries:
        try:
            response = requests.get(url, params=config, headers=headers)
            
            if response.status_code == 401 and not has_retried_with_new_token:
                try:
                    error_data = response.json()
                    error_messages = error_data.get("error", {}).get("messages", [])
                    if isinstance(error_messages, list) and any("Invalid User Access Token!" in msg for msg in error_messages):
                        TOKEN = fetch_token()
                        set_token(TOKEN)
                        headers["Authorization"] = f"Bearer {TOKEN}"
                        has_retried_with_new_token = True
                        continue
                except ValueError:
                    TOKEN = fetch_token()
                    set_token(TOKEN)
                    headers["Authorization"] = f"Bearer {TOKEN}"
                    has_retried_with_new_token = True
                    continue
            
            if response.status_code == 403:
                raise Exception(translate_error("rate_limit_exceeded", user_lang))
                
            if response.status_code >= 500:
                retry_count += 1
                if retry_count == max_retries:
                    raise Exception(translate_error("connection_error", user_lang))
                continue
                
            response.raise_for_status()
            train_data = response.json().get("data", {}).get("trains", [])
            return train_data
            
        except requests.RequestException as e:
            status_code = e.response.status_code if e.response is not None else None
            if status_code == 401 and not has_retried_with_new_token:
                try:
                    error_data = e.response.json()
                    error_messages = error_data.get("error", {}).get("messages", [])
                    if isinstance(error_messages, list) and any("Invalid User Access Token!" in msg for msg in error_messages):
                        TOKEN = fetch_token(user_lang)
                        set_token(TOKEN)
                        headers["Authorization"] = f"Bearer {TOKEN}"
                        has_retried_with_new_token = True
                        continue
                except ValueError:
                    TOKEN = fetch_token(user_lang)
                    set_token(TOKEN)
                    headers["Authorization"] = f"Bearer {TOKEN}"
                    has_retried_with_new_token = True
                    continue
                    
            if hasattr(e, 'response') and e.response and e.response.status_code == 403:
                raise Exception(translate_error("rate_limit_exceeded", user_lang))
            return []

def main(config: Dict, user_lang: str = 'en') -> Dict:
    result = {}
    train_data = fetch_train_details(config, user_lang)
    all_failed_with_422 = True

    if not train_data:
        return {"error": translate_error("no_trains_found", user_lang)}

    for train in train_data:
        seat_data = []
        for seat_type in train["seat_types"]:
            available_seats, booking_process_seats, available_count, booking_process_count, is_422, error_info, ticket_types = get_seat_layout(
                seat_type["trip_id"], seat_type["trip_route_id"], user_lang
            )

            seat_info = {
                "type": seat_type["type"],
                "available_count": available_count,
                "booking_process_count": booking_process_count,
                "available_seats": available_seats,
                "booking_process_seats": booking_process_seats,
                "is_422": is_422,
                "ticket_types": ticket_types
            }
            if is_422 and error_info:
                seat_info["error_info"] = error_info

            seat_data.append(seat_info)

            if not is_422:
                all_failed_with_422 = False

        result[train['trip_number']] = {
            "departure_time": train['departure_date_time'],
            "arrival_time": train['arrival_date_time'],
            "seat_data": seat_data
        }

    if all_failed_with_422 and train_data:
        return {"error": "422 error occurred for all trains", "details": result}

    return result