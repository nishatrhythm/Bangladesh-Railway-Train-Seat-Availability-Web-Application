function showLoaderAndSubmit(event) {
    const loader = document.getElementById('loader');
    const form = event.target;

    loader.style.display = 'block';

    setTimeout(() => {
        form.submit();
    }, 100);
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

        if (inputField && errorField) {
            if (inputField.value.trim() === "") {
                errorField.textContent = validation.message;
                errorField.style.display = "block";
                errorField.classList.remove('hide');
                errorField.classList.add('show');
                isValid = false;
            } else {
                if (errorField.classList.contains('show')) {
                    errorField.classList.remove('show');
                    errorField.classList.add('hide');
                }
            }
        }
    });

    const phoneField = document.getElementById('phone_number');
    const phoneError = document.getElementById('phone-error');
    if (phoneField) {
        const phoneValue = phoneField.value.trim();
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
            if (phoneError.classList.contains('show')) {
                phoneError.classList.remove('show');
                phoneError.classList.add('hide');
            }
        }
    }

    if (isValid) {
        showLoaderAndSubmit(event);
    } else {
        event.preventDefault();
    }
}

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
});

let lastErrorMessage = "";

function validateBangladeshPhoneNumber(input) {
    input.value = input.value.replace(/[^0-9]/g, '');

    if (input.value.length > 11) {
        input.value = input.value.slice(0, 11);
    }

    const phoneError = document.getElementById('phone-error');
    let errorMessage = "";

    if (input.value.length > 0) {
        if (input.value[0] !== '0' || input.value[1] !== '1') {
            errorMessage = 'Invalid Mobile Number';
        } else if (input.value.length > 2 && (input.value[2] < '3' || input.value[2] > '9')) {
            errorMessage = 'Invalid Mobile Number';
        }
    } else {
        errorMessage = 'Mobile number is required';
    }

    if (errorMessage !== lastErrorMessage) {
        if (errorMessage) {
            phoneError.textContent = errorMessage;
            phoneError.style.display = "block";
            phoneError.style.animation = "fadeIn 0.5s";
        } else {
            phoneError.style.display = "none";
        }
        lastErrorMessage = errorMessage;
    }
}

function filterDropdown(inputId, dropdownId) {
    const input = document.getElementById(inputId);
    const filter = input.value.toLowerCase();
    const dropdown = document.getElementById(dropdownId);
    const options = dropdown.getElementsByTagName('div');

    dropdown.style.display = filter ? "block" : "none";

    for (let i = 0; i < options.length; i++) {
        const textValue = options[i].textContent || options[i].innerText;
        options[i].style.display = textValue.toLowerCase().includes(filter) ? "" : "none";
    }
}

function selectOption(inputId, dropdownId, value) {
    document.getElementById(inputId).value = value;
    document.getElementById(dropdownId).style.display = "none";
    document.getElementById(inputId).focus();
}

function hideDropdown(dropdownId) {
    setTimeout(() => {
        const dropdown = document.getElementById(dropdownId);
        if (dropdown) {
            dropdown.style.display = "none";
        }
    }, 200);
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

document.addEventListener('DOMContentLoaded', function () {
    const today = new Date();
    const tenDaysLater = new Date();
    tenDaysLater.setDate(today.getDate() + 10);

    const dateInput = document.querySelector("#date");
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    const preFilledDate = dateInput.value;

    if (isMobile) {
        if (dateInput) {
            dateInput.setAttribute("type", "date");
            dateInput.setAttribute("min", today.toISOString().split("T")[0]);
            dateInput.setAttribute("max", tenDaysLater.toISOString().split("T")[0]);
            if (preFilledDate) {
                dateInput.value = preFilledDate;
            }
        }
    } else {
        if (dateInput) {
            const flatpickrInstance = flatpickr("#date", {
                dateFormat: "Y-m-d",
                altInput: true,
                altFormat: "d-M-Y",
                minDate: today,
                maxDate: tenDaysLater,
            });

            if (preFilledDate === today.toISOString().split("T")[0]) {
                flatpickrInstance.setDate(today);
            }
        }
    }
});
