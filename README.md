# Bangladesh Railway Seat Availability Web Application

This document provides an in-depth explanation of the implementation logic, algorithms, API interactions, data fetching process, and privacy measures used in the Bangladesh Railway Seat Availability Web Application.

---

## Core Implementation and Logic

### Authentication and Token Management

1. **Login and Authentication**:
   - Users log in using their **mobile number** and **password**, registered on the Bangladesh Railway system.
   - A POST request is sent to the **Bangladesh Railway API Authentication Endpoint**:
     - **URL**: `https://railspaapi.shohoz.com/v1.0/app/auth/sign-in`
     - **Payload**:
       ```json
       {
           "mobile_number": "<user_phone_number>",
           "password": "<user_password>"
       }
       ```
   - If the request is successful, the API responds with a token. This token is stored in an **HTTP-only cookie** to ensure secure access during subsequent requests.

2. **Token Usage**:
   - The token is included in the `Authorization` header for all API requests:
     ```json
     {
         "Authorization": "Bearer <token>"
     }
     ```

3. **Token Expiry Handling**:
   - If the token expires or becomes invalid, the user is redirected to the login page.
   - The application deletes the expired token from the cookie, ensuring no stale tokens are used.

---

### Fetching Train and Seat Data

1. **Train Details Request**:
   - After successful authentication, the application prepares a query based on user inputs (origin, destination, journey date, and seat class).
   - A GET request is sent to the **Train Search Endpoint**:
     - **URL**: `https://railspaapi.shohoz.com/v1.0/app/bookings/search-trips-v2`
     - **Query Parameters**:
       ```json
       {
           "from_city": "<origin>",
           "to_city": "<destination>",
           "date_of_journey": "<formatted_date>",
           "seat_class": "S_CHAIR"
       }
       ```

2. **Seat Layout Fetching**:
   - For each train returned in the train search, seat availability details are fetched via a second GET request to the **Seat Layout Endpoint**:
     - **URL**: `https://railspaapi.shohoz.com/v1.0/web/bookings/seat-layout`
     - **Query Parameters**:
       ```json
       {
           "trip_id": "<trip_id>",
           "trip_route_id": "<trip_route_id>"
       }
       ```

3. **Data Transformation**:
   - Train details and seat layouts are processed:
     - **Seats Grouping**: Seats are grouped by coach prefixes (e.g., `THA-1`, `THA-2`).
     - **Seat Counts**: Available seats and booking-in-process seats are counted for each coach.

4. **Data Output**:
   - The processed data is passed to the `results.html` template, which displays:
     - Train name, departure and arrival times.
     - Seat availability by coach and seat type.

---

### Algorithms and Data Processing

1. **Station Name Mapping**:
   - User-provided station names are mapped to API-compatible names using a dictionary (`STATION_NAME_MAPPING`).
   - For example:
     ```python
     STATION_NAME_MAPPING = {
         "Coxs Bazar": "Cox's Bazar"
     }
     ```

2. **Seat Grouping**:
   - Seats are grouped by their coach prefix (e.g., `THA`, `AC`).
   - **Algorithm**:
     ```python
     def group_by_prefix(seats):
         groups = {}
         for seat in seats:
             prefix = seat.split('-')[0]  # Extract coach prefix
             groups.setdefault(prefix, []).append(seat)
         return {prefix: {"seats": seats, "count": len(seats)} for prefix, seats in groups.items()}
     ```

3. **Data Sorting**:
   - Train results are sorted by departure time to improve user readability:
     ```python
     sorted_results = dict(sorted(
         result.items(),
         key=lambda item: datetime.strptime(item[1]['departure_time'], '%d %b, %I:%M %p')
     ))
     ```

---

### Privacy and Security

1. **No Credential Storage**:
   - **Mobile numbers** and **passwords** are used only to generate tokens through the API. These credentials are **not stored** on the server, database, or in memory.

2. **Token Security**:
   - Tokens are stored in **HTTP-only cookies**:
     - Prevents JavaScript access, mitigating XSS vulnerabilities.
     - Tokens are automatically cleared on logout or expiry.

3. **Direct API Communication**:
   - All requests to the Bangladesh Railway API are made directly from the application to ensure data privacy.
   - Sensitive data (e.g., credentials) is never intercepted or logged.

4. **Client-side Validation**:
   - Inputs like phone numbers and dates are validated client-side to minimize incorrect data submission and reduce server load.

5. **Clear User Feedback**:
   - All errors (e.g., invalid credentials, expired tokens) are displayed transparently to users without revealing sensitive details.

---

### Error Handling

1. **Token Errors**:
   - If a token is invalid or expired, the application:
     - Deletes the stale token from the cookie.
     - Prompts the user to log in again.

2. **API Errors**:
   - If the API returns errors (e.g., no trains available, seat layout unavailable), clear and concise messages are displayed on the homepage.

3. **Validation Errors**:
   - Client-side validation ensures all fields are filled correctly before submission.
   - Errors are dynamically displayed next to the corresponding fields.

---

## Key Files and Functionalities

1. **`app.py`**:
   - Manages routing, token handling, API interactions, and data processing.

2. **`detailsSeatAvailability.py`**:
   - Handles API requests for train and seat data.
   - Processes raw seat layout data into a structured format for frontend use.

3. **`templates/index.html`**:
   - Home page where users input journey details.
   - Dynamically displays errors and retains input values after validation.

4. **`templates/results.html`**:
   - Displays train details and seat availability in a user-friendly format.

5. **`stations_en.json`**:
   - A JSON file containing station names for dropdown selection.

6. **`static/js/script.js`**:
   - Implements client-side validation and interactivity, enhancing user experience.

7. **`static/styles.css`**:
   - Provides responsive and modern styling for the application.

---

This web application is designed with a focus on user privacy, seamless API integration, and a responsive user interface to ensure a secure and efficient experience for checking train seat availability.
"""