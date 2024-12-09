# Bangladesh Railway Seat Availability Web Application

This document provides an in-depth explanation of the implementation logic, algorithms, API interactions, data fetching process, privacy measures, backend functionality, frontend capabilities, and technologies used in the Bangladesh Railway Seat Availability Web Application. This project is based on the script [`detailsSeatAvailability.py`](https://github.com/nishatrhythm/Bangladesh-Railway-Segmented-Seat-Matrix-and-Details-Seat-Availabilty/blob/main/detailsSeatAvailability.py) and extends its functionality into a full-fledged web application.

**Live Link**: [Bangladesh Railway Seat Availability](https://trainseat.vercel.app/)  
> _**Note:** Currently, the Bangladesh Railway website restricts requests from the Vercel platform. The application will soon be deployed with a suitable workaround. In the meantime, you can clone and run the repository locally to explore its full functionality._

<br>

| <img src="/images/Screenshot_1.png" width="400"> | <img src="/images/Screenshot_2.png" width="400"> |
|--------------------------------------------------|--------------------------------------------------|
| <div align="center">**Screenshot 1**</div>      | <div align="center">**Screenshot 2**</div>      |

---

## Index

1. [Folder Structure](#folder-structure)
2. [Core Implementation and Logic](#core-implementation-and-logic)
   - [Authentication and Token Management](#authentication-and-token-management)
   - [Fetching Train and Seat Data](#fetching-train-and-seat-data)
3. [Data Processing](#data-processing)
4. [Privacy and Security](#privacy-and-security)
5. [Error Handling](#error-handling)
6. [Backend Functionality](#backend-functionality)
7. [Frontend Capabilities](#frontend-capabilities)
8. [Technologies Used](#technologies-used)

---

## Folder Structure
```
.
├── app.py                     # Main Flask application file
├── detailsSeatAvailability.py # Backend logic for fetching train and seat data
├── templates/
│   ├── index.html             # Home page template
│   ├── results.html           # Results page template
├── static/
│   ├── styles.css             # CSS for styling
│   ├── js/
│   │   └── script.js          # JavaScript for frontend functionality
├── stations_en.json           # JSON file containing station names
└── README.md                  # Project documentation
```
---

## Core Implementation and Logic

### Authentication and Token Management

**Key Highlights**:
- Secure login using mobile number and password.
- Token-based authentication for subsequent API requests.
- Automatic token expiry management.

1. **Login and Authentication**:
   - Users log in with their **mobile number** and **password**, registered on the Bangladesh Railway system.
   - A POST request is sent to the **Bangladesh Railway API Authentication Endpoint**:
     - **URL**: `https://railspaapi.shohoz.com/v1.0/app/auth/sign-in`
     - **Payload**:
       ```json
       {
           "mobile_number": "<user_phone_number>",
           "password": "<user_password>"
       }
       ```
   - If successful, the API responds with a token stored securely as an **HTTP-only cookie**.

2. **Token Usage**:
   - The token is included in the `Authorization` header for all API requests:
     ```json
     {
         "Authorization": "Bearer <token>"
     }
     ```

3. **Token Expiry Handling**:
   - If a token expires or becomes invalid:
     - The application deletes the expired token from the cookie.
     - Users are prompted to log in again.

---

### Fetching Train and Seat Data

**Key Highlights**:
- Dynamic API queries based on user input.
- Comprehensive seat data fetched and processed.

1. **Train Details Request**:
   - The application prepares a query based on user inputs: origin, destination, journey date, and seat class.
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
   - For each train in the search results, seat details are fetched via a second GET request:
     - **URL**: `https://railspaapi.shohoz.com/v1.0/web/bookings/seat-layout`
     - **Query Parameters**:
       ```json
       {
           "trip_id": "<trip_id>",
           "trip_route_id": "<trip_route_id>"
       }
       ```

3. **Data Transformation**:
   - Train and seat layouts are processed:
     - **Seats Grouping**: Seats are grouped by coach prefixes (e.g., `THA-1`, `THA-2`).
     - **Seat Counts**: Available and booking-in-process seats are counted.

4. **Data Output**:
   - The processed data is rendered on the `results.html` page, displaying:
     - Train details.
     - Seat availability by coach and seat type.

---

## Data Processing
  
### Seat Grouping

**Groups seats by coach prefix.**

```python
def group_by_prefix(seats):
    groups = {}
    for seat in seats:
        prefix = seat.split('-')[0]  # Extract coach prefix
        groups.setdefault(prefix, []).append(seat)
    return {prefix: {"seats": seats, "count": len(seats)} for prefix, seats in groups.items()}
```

### Data Sorting

**Sorts trains by departure time for better readability.**

```python
sorted_results = dict(sorted(
    result.items(),
    key=lambda item: datetime.strptime(item[1]['departure_time'], '%d %b, %I:%M %p')
))
```
## Privacy and Security

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

## Error Handling

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

## Backend Functionality

1. **Routing**:
   - Manages routes like `home`, `check_seats`, `show_results`, and `clear_token`.

2. **Session Management**:
   - Uses Flask sessions to store user inputs and session-specific data.

3. **Data Processing**:
   - Handles API requests and processes data for frontend templates.

4. **Error Management**:
   - Provides seamless error handling with clear messages.

---

## Frontend Capabilities

1. **Interactive Forms**:
   - Validates inputs dynamically and provides instant feedback.

2. **Responsive Design**:
   - Optimized for all devices using modern CSS.

3. **Enhanced UX**:
   - Features like auto-suggestions and dynamic dropdowns improve usability.

4. **Result Presentation**:
   - Displays comprehensive train and seat availability details.

---

## Technologies Used

### Backend:
- **Flask**: Core framework for routing and session management.
- **Python**: Handles API logic and data processing.
- **Requests Library**: Communicates with the Bangladesh Railway API.

### Frontend:
- **HTML5, CSS3, JavaScript**: Builds a modern, interactive UI.
- **Flatpickr**: Enhances date picker functionality.
- **FontAwesome**: Provides intuitive icons.

### Data:
- **JSON**: Manages station mapping and API responses.

### Security:
- **HTTP-only Cookies**: Ensures secure token storage.
- **Input Validation**: Prevents erroneous or malicious submissions.

---
This web application is designed with a focus on user privacy, seamless API integration, and a responsive user interface to ensure a secure and efficient experience for checking train seat availability.
