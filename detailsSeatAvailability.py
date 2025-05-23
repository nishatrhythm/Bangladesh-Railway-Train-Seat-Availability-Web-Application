from typing import Dict, List, Tuple
import requests, os
from colorama import Fore, init
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv('/etc/secrets/.env')

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

def fetch_token() -> str:
    mobile_number = os.getenv("FIXED_MOBILE_NUMBER")
    password = os.getenv("FIXED_PASSWORD")
    if not mobile_number or not password:
        raise Exception("Fixed mobile number or password not configured.")
    url = f"{API_BASE_URL}/app/auth/sign-in"
    payload = {"mobile_number": mobile_number, "password": password}
    max_retries = 3
    retry_count = 0
    while retry_count < max_retries:
        try:
            response = requests.post(url, json=payload)
            if response.status_code == 422:
                raise Exception("Server-side Mobile Number or Password is incorrect. Please wait a moment while we resolve this issue.")
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

def analyze_seat_layout(data: Dict) -> Dict:
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
    for t, label in [(1, "Released Tickets to Buy"),
                     (3, "Released Tickets to Buy"),
                     (2, "Soon-to-be-Released Tickets to Buy"),
                     (4, "Reserved Tickets (not for sale)")]:
        if seats[t]:
            sorted_seats = sorted(seats[t], key=sort_seat_number)
            ticket_types[t] = {
                "label": label,
                "seats": sorted_seats,
                "count": len(sorted_seats)
            }
    
    ticket_types["released_total"] = {
        "count": len(seats[1]) + len(seats[3])
    }

    return ticket_types

def get_seat_layout(trip_id: str, trip_route_id: str) -> Tuple[List[str], List[str], int, int, bool, dict, dict]:
    global TOKEN
    if not TOKEN:
        TOKEN = fetch_token()
        set_token(TOKEN)
    
    url = f"{API_BASE_URL}/app/bookings/seat-layout"
    headers = {"Authorization": f"Bearer {TOKEN}"}
    params = {"trip_id": trip_id, "trip_route_id": trip_route_id}
    max_retries = 3
    retry_count = 0
    has_retried_with_new_token = False

    while retry_count < max_retries:
        try:
            response = requests.get(url, headers=headers, params=params)
            if response.status_code >= 500:
                retry_count += 1
                if retry_count == max_retries:
                    raise Exception("We're unable to connect to the Bangladesh Railway website right now. Please try again in a few minutes.")
                continue
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

            ticket_types = analyze_seat_layout(data)

            return (available_seats_sorted, booking_process_seats_sorted, len(available_seats), len(booking_process_seats), False, {}, ticket_types)

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

def fetch_train_details(config: Dict) -> List[Dict]:
    url = f"{API_BASE_URL}/app/bookings/search-trips-v2"
    headers = {}
    max_retries = 3
    retry_count = 0

    while retry_count < max_retries:
        try:
            response = requests.get(url, params=config, headers=headers)
            if response.status_code == 403:
                raise Exception("Rate limit exceeded. Please try again later.")
                
            if response.status_code >= 500:
                retry_count += 1
                if retry_count == max_retries:
                    raise Exception("We're unable to connect to the Bangladesh Railway website right now. Please try again in a few minutes.")
                continue
                
            response.raise_for_status()
            train_data = response.json().get("data", {}).get("trains", [])
            return train_data
        except requests.RequestException as e:
            if hasattr(e, 'response') and e.response and e.response.status_code == 403:
                raise Exception("Rate limit exceeded. Please try again later.")
            return []

def main(config: Dict) -> Dict:
    result = {}
    train_data = fetch_train_details(config)
    all_failed_with_422 = True

    if not train_data:
        return {"error": "No trains found for the given criteria."}

    for train in train_data:
        seat_data = []
        for seat_type in train["seat_types"]:
            available_seats, booking_process_seats, available_count, booking_process_count, is_422, error_info, ticket_types = get_seat_layout(
                seat_type["trip_id"], seat_type["trip_route_id"]
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