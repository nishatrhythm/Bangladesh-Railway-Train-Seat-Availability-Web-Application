from typing import Dict, List, Tuple
import requests
from colorama import Fore, init

init(autoreset=True)

API_BASE_URL = 'https://railspaapi.shohoz.com/v1.0'
SEAT_AVAILABILITY = {'AVAILABLE': 1, 'IN_PROCESS': 2}

TOKEN = None

def set_token(token: str):
    """Set the token dynamically."""
    global TOKEN
    TOKEN = token

def get_seat_layout(trip_id: str, trip_route_id: str) -> Tuple[List[str], List[str], int, int]:
    url = f"{API_BASE_URL}/web/bookings/seat-layout"
    headers = {"Authorization": f"Bearer {TOKEN}"}
    params = {"trip_id": trip_id, "trip_route_id": trip_route_id}

    try:
        response = requests.get(url, headers=headers, params=params)
        if response.status_code == 401:
            raise Exception("Token expired or unauthorized")
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

        return (available_seats, booking_process_seats, len(available_seats), len(booking_process_seats))

    except requests.RequestException as e:
        if response.status_code == 401:
            raise Exception("Token expired or unauthorized")
        print(f"{Fore.RED}Failed to fetch seat layout: {e}")
        return [], [], 0, 0

def fetch_train_details(config: Dict) -> List[Dict]:
    """
    Fetch train details based on user-provided configuration.
    """
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
    """
    Main function to fetch and process train and seat availability data.
    """
    result = {}
    train_data = fetch_train_details(config)

    if not train_data:
        return {"error": "No trains found for the given criteria."}

    for train in train_data:
        seat_data = []
        for seat_type in train["seat_types"]:
            available_seats, booking_process_seats, available_count, booking_process_count = get_seat_layout(
                seat_type["trip_id"], seat_type["trip_route_id"]
            )

            seat_data.append({
                "type": seat_type["type"],
                "available_count": available_count,
                "booking_process_count": booking_process_count,
                "available_seats": available_seats,
                "booking_process_seats": booking_process_seats
            })

        result[train['trip_number']] = {
            "departure_time": train['departure_date_time'],
            "arrival_time": train['arrival_date_time'],
            "seat_data": seat_data
        }

    return result