from typing import Dict, List, Tuple
import requests
from colorama import Fore, init

init(autoreset=True)

API_BASE_URL = 'https://railspaapi.shohoz.com/v1.0'
SEAT_AVAILABILITY = {'AVAILABLE': 1, 'IN_PROCESS': 2}

BANGLA_COACH_ORDER = [
    "KA", "KHA", "GA", "GHA", "UMA", "CHA", "SCHA", "JA", "JHA", "NEO",
    "TA", "THA", "DA", "DHA", "TO", "THO", "DOA", "DANT", "XTR1", "XTR2", "XTR3", "XTR4", "XTR5", "SLR"
]
COACH_INDEX = {coach: idx for idx, coach in enumerate(BANGLA_COACH_ORDER)}

TOKEN = None

def set_token(token: str):
    """Set the token dynamically."""
    global TOKEN
    TOKEN = token

def sort_seat_number(seat: str) -> tuple:
    """Custom sorting key for seat numbers like 'KA-1' or 'GHA-UP-14' in Bangla order, prioritizing number."""
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

def get_seat_layout(trip_id: str, trip_route_id: str) -> Tuple[List[str], List[str], int, int, bool]:
    url = f"{API_BASE_URL}/web/bookings/seat-layout"
    headers = {"Authorization": f"Bearer {TOKEN}"}
    params = {"trip_id": trip_id, "trip_route_id": trip_route_id}

    try:
        response = requests.get(url, headers=headers, params=params)
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

        return (available_seats_sorted, booking_process_seats_sorted, len(available_seats), len(booking_process_seats), False)

    except requests.RequestException as e:
        status_code = e.response.status_code if e.response is not None else None
        if status_code == 401:
            raise Exception("Token expired or unauthorized")
        if status_code == 422:
            return [], [], 0, 0, True
        print(f"{Fore.RED}Failed to fetch seat layout: {e}")
        return [], [], 0, 0, False

def fetch_train_details(config: Dict) -> List[Dict]:
    url = f"{API_BASE_URL}/app/bookings/search-trips-v2"
    headers = {"Authorization": f"Bearer {TOKEN}"}

    try:
        response = requests.get(url, params=config, headers=headers)
        response.raise_for_status()
        train_data = response.json().get("data", {}).get("trains", [])
        return train_data
    except requests.RequestException as e:
        print(f"{Fore.RED}Failed to fetch train details: {e}")
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
            available_seats, booking_process_seats, available_count, booking_process_count, is_422 = get_seat_layout(
                seat_type["trip_id"], seat_type["trip_route_id"]
            )

            seat_data.append({
                "type": seat_type["type"],
                "available_count": available_count,
                "booking_process_count": booking_process_count,
                "available_seats": available_seats,
                "booking_process_seats": booking_process_seats,
                "is_422": is_422
            })

            if not is_422:
                all_failed_with_422 = False

        result[train['trip_number']] = {
            "departure_time": train['departure_date_time'],
            "arrival_time": train['arrival_date_time'],
            "seat_data": seat_data
        }

    if all_failed_with_422 and train_data:
        return {"error": "422 error occurred for all trains"}

    return result