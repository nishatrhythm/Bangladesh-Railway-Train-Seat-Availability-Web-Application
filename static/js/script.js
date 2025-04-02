document.documentElement.classList.add('js-enabled');

const cachedStations = localStorage.getItem('railwayStations');
const stationData = cachedStations ? JSON.parse(cachedStations) : window.stationsData;

if (!cachedStations && window.stationsData) {
    localStorage.setItem('railwayStations', JSON.stringify(window.stationsData));
}

const minDate = window.minDate;
const maxDate = window.maxDate;

function showLoaderAndSubmit(event) {
    const loader = document.getElementById('loader');
    const form = event.target;
    loader.style.display = 'block';
    setTimeout(() => form.submit(), 10);
}

let suppressDropdown = false;

function swapStations() {
    suppressDropdown = true;
    const originInput = document.getElementById('origin');
    const destinationInput = document.getElementById('destination');
    if (originInput && destinationInput) {
        const tempValue = originInput.value;
        originInput.value = destinationInput.value;
        destinationInput.value = tempValue;
    }
    setTimeout(() => suppressDropdown = false, 300);
}

function validateForm(event) {
    let isValid = true;
    const validations = [
        { id: 'phone_number', errorId: 'phone-error', message: 'Mobile Number is required' },
        { id: 'password', errorId: 'password-error', message: 'Password is required' },
        { id: 'origin', errorId: 'origin-error', message: 'Origin Station is required' },
        { id: 'destination', errorId: 'destination-error', message: 'Destination Station is required' },
        { id: 'date', errorId: 'date-error', message: 'Date of Journey is required' }
    ];

    validations.forEach(validation => {
        const inputField = document.getElementById(validation.id);
        const errorField = document.getElementById(validation.errorId);
        if (inputField && errorField && inputField.value.trim() === "") {
            errorField.textContent = validation.message;
            errorField.style.display = "block";
            errorField.classList.remove('hide');
            errorField.classList.add('show');
            isValid = false;
        } else if (inputField && errorField) {
            errorField.classList.remove('show');
            errorField.classList.add('hide');
        }
    });

    const phoneField = document.getElementById('phone_number');
    if (phoneField) {
        const phoneValue = phoneField.value.trim();
        const phoneError = document.getElementById('phone-error');
        if (phoneValue === "") {
            phoneError.textContent = "Mobile Number is required";
            phoneError.style.display = "block";
            phoneError.classList.remove('hide');
            phoneError.classList.add('show');
            isValid = false;
        } else if (phoneValue.length !== 11) {
            phoneError.textContent = "Mobile Number must be exactly 11 digits";
            phoneError.style.display = "block";
            phoneError.classList.remove('hide');
            phoneError.classList.add('show');
            isValid = false;
        } else {
            phoneError.classList.remove('show');
            phoneError.classList.add('hide');
        }
    }

    if (isValid) showLoaderAndSubmit(event);
    else event.preventDefault();
}

const toggleIcon = document.querySelector(".toggle-password");
const passwordInput = document.getElementById("password");

if (toggleIcon && passwordInput) {
    toggleIcon.addEventListener("click", function () {
        const isHidden = passwordInput.type === "password";
        passwordInput.type = isHidden ? "text" : "password";
        toggleIcon.classList.toggle("fa-eye");
        toggleIcon.classList.toggle("fa-eye-slash");
    });
}

document.getElementById("seatForm")?.addEventListener("submit", validateForm);

document.getElementById("phone_number")?.addEventListener("input", function () {
    validateBangladeshPhoneNumber(this);
});

document.getElementById("origin")?.addEventListener("keyup", () => filterDropdown("origin", "originDropdown"));
document.getElementById("origin")?.addEventListener("blur", () => setTimeout(() => hideDropdown("originDropdown"), 200));

document.getElementById("destination")?.addEventListener("keyup", () => filterDropdown("destination", "destinationDropdown"));
document.getElementById("destination")?.addEventListener("blur", () => setTimeout(() => hideDropdown("destinationDropdown"), 200));

document.querySelector(".swap-icon-wrapper")?.addEventListener("click", swapStations);

document.addEventListener('DOMContentLoaded', function () {
    const fields = [
        { id: 'phone_number', errorId: 'phone-error' },
        { id: 'password', errorId: 'password-error' },
        { id: 'origin', errorId: 'origin-error' },
        { id: 'destination', errorId: 'destination-error' },
        { id: 'date', errorId: 'date-error' }
    ];

    fields.forEach(field => {
        const inputField = document.getElementById(field.id);
        const errorField = document.getElementById(field.errorId);
        if (inputField && errorField) {
            inputField.addEventListener('input', function () {
                if (errorField.classList.contains('show')) {
                    errorField.classList.remove('show');
                    errorField.classList.add('hide');
                }
            });
            errorField.addEventListener('animationend', function (event) {
                if (event.animationName === 'fadeOutScale') {
                    errorField.style.display = 'none';
                }
            });
        }
    });

    const dateInput = document.querySelector("#date");
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const preFilledDate = dateInput.value;

    if (isMobile) {
        if (dateInput) {
            dateInput.setAttribute("type", "date");
            dateInput.setAttribute("min", minDate);
            dateInput.setAttribute("max", maxDate);
            if (preFilledDate) dateInput.value = preFilledDate;
            dateInput.addEventListener('change', function () {
                const selected = new Date(this.value);
                const min = new Date(minDate);
                const max = new Date(maxDate);
                if (selected < min || selected > max) this.value = minDate;
                if (document.activeElement === dateInput) dateInput.blur();
            });
        }
    } else {
        if (dateInput) {
            window.flatpickrInstance = flatpickr("#date", {
                dateFormat: "Y-m-d",
                altInput: true,
                altFormat: "d-M-Y",
                minDate: minDate,
                maxDate: maxDate,
                onClose: function(selectedDates, dateStr, instance) {
                    suppressDropdown = true;
                    dateInput.blur();
                    setTimeout(() => suppressDropdown = false, 300);
                }
            });
            if (preFilledDate && preFilledDate === minDate) {
                window.flatpickrInstance.setDate(minDate);
            }
        }
    }
});

let lastErrorMessage = "";

function validateBangladeshPhoneNumber(input) {
    input.value = input.value.replace(/[^0-9]/g, '');
    if (input.value.length > 11) input.value = input.value.slice(0, 11);
    const phoneError = document.getElementById('phone-error');
    let errorMessage = "";
    if (input.value.length > 0) {
        if (input.value[0] !== '0' || input.value[1] !== '1') errorMessage = 'Invalid Mobile Number';
        else if (input.value.length > 2 && (input.value[2] < '3' || input.value[2] > '9')) errorMessage = 'Invalid Mobile Number';
    } else errorMessage = 'Mobile number is required';
    if (errorMessage !== lastErrorMessage) {
        phoneError.textContent = errorMessage;
        phoneError.style.display = errorMessage ? "block" : "none";
        if (errorMessage) phoneError.style.animation = "fadeIn 0.5s";
        lastErrorMessage = errorMessage;
    }
}

function filterDropdown(inputId, dropdownId) {
    if (suppressDropdown) return;
    const input = document.getElementById(inputId);
    const filter = input.value.toLowerCase();
    const dropdown = document.getElementById(dropdownId);
    const otherInputId = inputId === 'origin' ? 'destination' : 'origin';
    const otherInput = document.getElementById(otherInputId);
    const excludeStation = otherInput.value.trim();

    dropdown.innerHTML = '';

    if (filter.length < 2 || input !== document.activeElement) {
        dropdown.style.display = "none";
        return;
    } else {
        dropdown.style.display = "block";
    }

    const filteredStations = stationData
        .filter(station => station.toLowerCase().includes(filter) && station !== excludeStation)
        .slice(0, 5);

    filteredStations.forEach(station => {
        const option = document.createElement('div');
        option.textContent = station;
        option.addEventListener('mousedown', () => selectOption(inputId, dropdownId, station));
        dropdown.appendChild(option);
    });

    if (filteredStations.length === 0) {
        dropdown.style.display = "none";
    }
}

function selectOption(inputId, dropdownId, value) {
    suppressDropdown = true;
    const input = document.getElementById(inputId);
    if (!input) return;

    input.value = value;

    const dropdown = document.getElementById(dropdownId);
    if (dropdown) dropdown.style.display = "none";

    const origin = document.getElementById('origin');
    const destination = document.getElementById('destination');
    const date = document.getElementById('date');

    setTimeout(() => {
        if (inputId === 'origin' && !destination.value.trim()) {
            destination.focus();
        } else if (inputId === 'destination' && !date.value.trim()) {
            date.focus();
            if (window.flatpickrInstance) window.flatpickrInstance.open();
        }
        suppressDropdown = false;
    }, 100);
}

function hideDropdown(dropdownId) {
    const dropdown = document.getElementById(dropdownId);
    if (dropdown) {
        dropdown.style.display = "none";
    }
}

function togglePasswordVisibility() {
    const passwordField = document.getElementById("password");
    const toggleIcon = document.querySelector(".toggle-password");
    if (passwordField.type === "password") {
        passwordField.type = "text";
        toggleIcon.classList.remove("fa-eye");
        toggleIcon.classList.add("fa-eye-slash");
    } else {
        passwordField.type = "password";
        toggleIcon.classList.remove("fa-eye-slash");
        toggleIcon.classList.add("fa-eye");
    }
}

function start404Countdown() {
    const countdownElement = document.getElementById('countdown');
    if (countdownElement) {
        let countdown = 10;
        
        const timer = setInterval(() => {
            countdown--;
            countdownElement.textContent = countdown;
            if (countdown <= 0) {
                clearInterval(timer);
                window.location.href = '/';
            }
        }, 1000);
    }
}

document.addEventListener('DOMContentLoaded', start404Countdown);