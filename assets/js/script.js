document.documentElement.classList.add('js-enabled');

let stationData;

function loadStations() {
    return new Promise((resolve) => {
        const cachedStations = localStorage.getItem('railwayStations');
        if (cachedStations) {
            stationData = JSON.parse(cachedStations);
            resolve();
        } else {
            const stationsElement = document.getElementById('stations-data');
            if (stationsElement) {
                stationData = JSON.parse(stationsElement.textContent);
                localStorage.setItem('railwayStations', JSON.stringify(stationData));
                resolve();
            } else {
                stationData = [];
                resolve();
            }
        }
    });
}

function loadBannerImage() {
    return new Promise((resolve) => {
        const bannerContainer = document.getElementById('bannerImageContainer');
        if (!bannerContainer) {
            resolve();
            return;
        }

        const configData = JSON.parse(document.getElementById('app-config').textContent);
        const appVersion = configData.version || "1.0.0";
        const currentImageUrl = window.bannerImageUrl;

        if (!currentImageUrl) {
            resolve();
            return;
        }

        const cachedImageData = localStorage.getItem('bannerImageData');
        const img = document.createElement('img');
        img.alt = 'Banner';
        img.className = 'banner-image animated-zoom-in';

        if (cachedImageData) {
            const parsedCache = JSON.parse(cachedImageData);
            if (parsedCache.url === currentImageUrl && parsedCache.version === appVersion) {
                img.src = parsedCache.base64;
                bannerContainer.appendChild(img);
                resolve();
                return;
            }
        }

        img.src = currentImageUrl;
        bannerContainer.appendChild(img);

        localStorage.setItem('bannerImageData', JSON.stringify({
            url: currentImageUrl,
            base64: currentImageUrl,
            version: appVersion
        }));

        img.onload = () => resolve();
        img.onerror = () => {
            bannerContainer.removeChild(img);
            resolve();
        };
    });
}

const minDate = window.minDate;
const maxDate = window.maxDate;

let suppressDropdown = false;
let suppressEvents = false;

function showLoaderAndSubmit(event) {
    event.preventDefault();
    const loader = document.getElementById('loader');
    const progressContainer = document.getElementById('progressContainer');
    const form = event.target;

    if (window.innerWidth <= 768 && progressContainer) {
        progressContainer.style.display = 'block';
        setTimeout(() => form.submit(), 10);
    } else if (loader && form) {
        loader.style.display = 'block';
        setTimeout(() => form.submit(), 10);
    }
}

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

function validateBangladeshPhoneNumber(input) {
    input.value = input.value.replace(/[^0-9]/g, '');
    if (input.value.length > 11) input.value = input.value.slice(0, 11);
    const phoneError = document.getElementById('phone-error');
    let errorMessage = "";
    if (input.value.length > 0) {
        if (input.value[0] !== '0' || input.value[1] !== '1') errorMessage = 'Invalid Mobile Number';
        else if (input.value.length > 2 && (input.value[2] < '3' || input.value[2] > '9')) errorMessage = 'Invalid Mobile Number';
    } else errorMessage = 'Mobile number is required';
    if (errorMessage) {
        phoneError.textContent = errorMessage;
        phoneError.style.display = "block";
        phoneError.style.animation = "fadeIn 0.5s";
    } else {
        phoneError.style.display = "none";
    }
}

function filterDropdown(inputId, dropdownId) {
    if (suppressDropdown || !stationData) return;
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    if (!input || !dropdown) return;

    const filter = input.value.toLowerCase();
    const otherInputId = inputId === 'origin' ? 'destination' : 'origin';
    const otherInput = document.getElementById(otherInputId);
    const excludeStation = otherInput ? otherInput.value.trim() : '';

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
    suppressEvents = true;
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    if (!input || !dropdown) return;

    input.value = value;
    dropdown.style.display = "none";

    const origin = document.getElementById('origin');
    const destination = document.getElementById('destination');
    const date = document.getElementById('date');

    if (inputId === 'destination' && date && !date.value.trim()) {
        setTimeout(() => {
            date.focus();
            openMaterialCalendar();
            setTimeout(() => {
                suppressEvents = false;
            }, 200);
        }, 100);
    } else {
        setTimeout(() => {
            if (inputId === 'origin' && destination && !destination.value.trim()) {
                destination.focus();
            }
            suppressEvents = false;
        }, 100);
    }

    const stopPropagation = (e) => e.stopPropagation();
    document.addEventListener('mousedown', stopPropagation, { once: true });
    document.addEventListener('click', stopPropagation, { once: true });
}

function hideDropdown(dropdownId) {
    const dropdown = document.getElementById(dropdownId);
    if (dropdown) dropdown.style.display = "none";
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

document.addEventListener('DOMContentLoaded', function () {
    Promise.all([loadStations(), loadBannerImage()]).then(() => {
        document.querySelectorAll('a[class^="btn-"], button[class^="btn-"]').forEach(el => {
            el.setAttribute('draggable', 'false');
        });

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

        const seatForm = document.getElementById("seatForm");
        if (seatForm) seatForm.addEventListener("submit", validateForm);

        const phoneNumber = document.getElementById("phone_number");
        if (phoneNumber) phoneNumber.addEventListener("input", function () {
            validateBangladeshPhoneNumber(this);
        });

        const origin = document.getElementById("origin");
        if (origin) {
            origin.addEventListener("keyup", () => filterDropdown("origin", "originDropdown"));
            origin.addEventListener("blur", () => setTimeout(() => hideDropdown("originDropdown"), 200));
        }

        const destination = document.getElementById("destination");
        if (destination) {
            destination.addEventListener("keyup", () => filterDropdown("destination", "destinationDropdown"));
            destination.addEventListener("blur", () => setTimeout(() => hideDropdown("destinationDropdown"), 200));
        }

        const swapIcon = document.querySelector(".swap-icon-wrapper");
        if (swapIcon) {
            swapIcon.addEventListener("click", function () {
                swapStations();
                swapIcon.classList.add("rotate");
                setTimeout(() => {
                    swapIcon.classList.remove("rotate");
                }, 400);
            });
        }

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

        start404Countdown();

        const configData = JSON.parse(document.getElementById('app-config').textContent);
        const forceBanner = configData.force_banner || 0;
        const appVersion = configData.version || "1.0.0";

        const modal = document.getElementById('bannerModal');
        const closeModal = document.querySelector('.close-modal');
        const dontShowAgainCheckbox = document.getElementById('dontShowAgain');
        const storedData = JSON.parse(localStorage.getItem('bannerState') || '{}');
        const dontShowAgain = storedData.dontShowAgain === true;
        const storedVersion = storedData.version || "0.0.0";

        if (modal) {
            if (forceBanner === 1 && (!dontShowAgain || storedVersion !== appVersion)) {
                modal.classList.add('active');
                document.body.style.overflow = 'hidden';
            } else if (forceBanner !== 1 && !dontShowAgain) {
                modal.classList.add('active');
                document.body.style.overflow = 'hidden';
            }

            if (closeModal) {
                closeModal.addEventListener('click', function () {
                    modal.classList.remove('active');
                    document.body.style.overflow = 'auto';
                    if (dontShowAgainCheckbox && dontShowAgainCheckbox.checked) {
                        localStorage.setItem('bannerState', JSON.stringify({
                            dontShowAgain: true,
                            version: appVersion
                        }));
                    }
                });
            }
        }
    });
});

document.addEventListener("mousedown", (e) => {
    const calendar = document.getElementById("materialCalendar");
    const dateInput = document.getElementById("date");

    if (suppressEvents) {
        return;
    }

    if (!calendar.contains(e.target) && e.target !== dateInput && !dateInput.contains(e.target)) {
        closeMaterialCalendar();
    }
});

document.addEventListener("click", (e) => {
    const calendar = document.getElementById("materialCalendar");
    const dateInput = document.getElementById("date");

    if (suppressEvents) {
        return;
    }

    if (!calendar.contains(e.target) && e.target !== dateInput && !dateInput.contains(e.target)) {
        closeMaterialCalendar();
    }
});

const DATE_LIMIT_DAYS = 11;
const input = document.getElementById("date");

let calendarCurrentMonth;
let calendarMinDate;
let calendarMaxDate;

function getBSTDate() {
    const inputElement = document.getElementById('date');
    const bstMidnightUtc = inputElement?.dataset.bstMidnightUtc || '2025-04-03T18:00:00Z';
    const bstMidnight = new Date(bstMidnightUtc);
    
    const now = new Date();
    const utcOffset = now.getTimezoneOffset() * 60000;
    const bstOffset = 6 * 60 * 60 * 1000;
    const localMidnight = new Date(now.setUTCHours(0, 0, 0, 0) - utcOffset + bstOffset);
    
    if (localMidnight > bstMidnight) {
        const daysDiff = Math.floor((localMidnight - bstMidnight) / (24 * 60 * 60 * 1000));
        bstMidnight.setUTCDate(bstMidnight.getUTCDate() + daysDiff);
    }
    return bstMidnight;
}

function formatDate(date) {
    return date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    }).replace(/ /g, "-");
}

function parseDate(dateStr) {
    const [day, monthStr, year] = dateStr.split("-");
    const monthIndex = new Date(`${monthStr} 1, ${year}`).getMonth();
    return new Date(year, monthIndex, parseInt(day, 10));
}

function isSameDate(d1, d2) {
    return (
        d1.getDate() === d2.getDate() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getFullYear() === d2.getFullYear()
    );
}

function addDays(date, days) {
    const newDate = new Date(date);
    newDate.setUTCDate(newDate.getUTCDate() + days);
    return newDate;
}

function generateMaterialCalendar() {
    const calendarDays = document.getElementById("calendarDays");
    const calendarTitle = document.getElementById("calendarTitle");
    if (!calendarDays || !calendarTitle) return;

    calendarDays.innerHTML = "";
    const options = { month: "long", year: "numeric" };
    calendarTitle.textContent = calendarCurrentMonth.toLocaleDateString("en-US", options);

    const prevBtn = document.getElementById("prevMonthBtn");
    const nextBtn = document.getElementById("nextMonthBtn");
    if (!prevBtn || !nextBtn) return;

    const minMonth = new Date(calendarMinDate.getFullYear(), calendarMinDate.getMonth(), 1);
    const maxMonth = new Date(calendarMaxDate.getFullYear(), calendarMaxDate.getMonth(), 1);

    prevBtn.disabled = calendarCurrentMonth <= minMonth;
    nextBtn.disabled = calendarCurrentMonth >= maxMonth;

    const monthStart = new Date(calendarCurrentMonth.getFullYear(), calendarCurrentMonth.getMonth(), 1);
    const monthEnd = new Date(calendarCurrentMonth.getFullYear(), calendarCurrentMonth.getMonth() + 1, 0);

    const startWeekday = monthStart.getDay();
    for (let i = 0; i < startWeekday; i++) {
        const spacer = document.createElement("div");
        spacer.className = "calendar-day-spacer";
        calendarDays.appendChild(spacer);
    }

    const selectedDate = input.value ? parseDate(input.value) : null;
    let current = new Date(monthStart);

    while (current <= monthEnd) {
        const dayBtn = document.createElement("button");
        dayBtn.className = "calendar-day";
        dayBtn.textContent = current.getDate();

        const currentClone = new Date(current);
        const inRange = currentClone >= calendarMinDate && currentClone <= calendarMaxDate;

        if (!inRange) {
            dayBtn.className += " disabled";
            dayBtn.disabled = true;
        }

        if (selectedDate && isSameDate(currentClone, selectedDate)) {
            dayBtn.className += " selected";
        }

        if (isSameDate(currentClone, calendarMinDate)) {
            dayBtn.className += " today";
        }

        dayBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (inRange) {
                input.value = formatDate(currentClone);
                closeMaterialCalendar();

                const dateError = document.getElementById('date-error');
                if (dateError && dateError.classList.contains('show')) {
                    dateError.classList.remove('show');
                    dateError.classList.add('hide');
                }
            }
        });

        calendarDays.appendChild(dayBtn);
        current.setUTCDate(current.getUTCDate() + 1);
    }
}

function openMaterialCalendar() {
    const calendar = document.getElementById("materialCalendar");
    if (!calendar) return;
    calendar.style.display = "block";
    generateMaterialCalendar();

    calendar.addEventListener("click", (e) => {
        e.stopPropagation();
    });
}

function closeMaterialCalendar() {
    const calendar = document.getElementById("materialCalendar");
    if (calendar) {
        calendar.classList.add('fade-out');
        setTimeout(() => {
            calendar.style.display = "none";
            calendar.classList.remove('fade-out');
        }, 200);
    }
}

function updateCalendarDates() {
    const todayBST = getBSTDate();
    calendarMinDate = new Date(todayBST);
    calendarMaxDate = addDays(todayBST, DATE_LIMIT_DAYS - 1);
    calendarCurrentMonth = new Date(calendarMinDate.getFullYear(), calendarMinDate.getMonth(), 1);

    const calendar = document.getElementById("materialCalendar");
    if (calendar && calendar.style.display === "block") {
        generateMaterialCalendar();
    }
}

function initMaterialCalendar() {
    if (!input) {
        return;
    }
    updateCalendarDates();

    input.addEventListener("focus", openMaterialCalendar);
    input.addEventListener("click", openMaterialCalendar);

    const prevBtn = document.getElementById("prevMonthBtn");
    const nextBtn = document.getElementById("nextMonthBtn");
    if (prevBtn) {
        prevBtn.addEventListener("click", () => {
            const prevMonth = new Date(calendarCurrentMonth.getFullYear(), calendarCurrentMonth.getMonth() - 1, 1);
            if (prevMonth >= new Date(calendarMinDate.getFullYear(), calendarMinDate.getMonth(), 1)) {
                calendarCurrentMonth = prevMonth;
                generateMaterialCalendar();
            }
        });
    }
    if (nextBtn) {
        nextBtn.addEventListener("click", () => {
            const nextMonth = new Date(calendarCurrentMonth.getFullYear(), calendarCurrentMonth.getMonth() + 1, 1);
            if (nextMonth <= new Date(calendarMaxDate.getFullYear(), calendarMaxDate.getMonth(), 1)) {
                calendarCurrentMonth = nextMonth;
                generateMaterialCalendar();
            }
        });
    }

    setInterval(() => {
        const nowBST = getBSTDate();
        if (!isSameDate(nowBST, calendarMinDate)) {
            updateCalendarDates();
        }
    }, 60000);
}

document.addEventListener("DOMContentLoaded", () => {
    initMaterialCalendar();
});