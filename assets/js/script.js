document.documentElement.classList.add('js-enabled');

let stationData;

function loadStations() {
    return new Promise((resolve) => {
        const cachedStations = localStorage.getItem('railwayStations');
        const stationsElement = document.getElementById('stations-data');
        let serverStations, serverVersion;

        if (stationsElement) {
            const data = JSON.parse(stationsElement.textContent);
            serverStations = data.stations;
            serverVersion = data.version || "1.0.0";
        } else {
            serverStations = [];
            serverVersion = "1.0.0";
        }

        if (cachedStations) {
            const cachedData = JSON.parse(cachedStations);
            const cachedVersion = cachedData.version || "0.0.0";
            if (cachedVersion === serverVersion) {
                stationData = cachedData.stations;
                resolve();
            } else {
                stationData = serverStations;
                localStorage.setItem('railwayStations', JSON.stringify({
                    stations: serverStations,
                    version: serverVersion
                }));
                resolve();
            }
        } else {
            stationData = serverStations;
            localStorage.setItem('railwayStations', JSON.stringify({
                stations: serverStations,
                version: serverVersion
            }));
            resolve();
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
    const form = event.target;
    const submitButton = form.querySelector('.btn-primary');
    const searchIcon = submitButton.querySelector('.fas.fa-search');
    
    submitButton.disabled = true;
    submitButton.style.opacity = '0.6';
    submitButton.style.cursor = 'not-allowed';
    
    if (searchIcon) {
        searchIcon.remove();
        const loader = document.createElement('span');
        loader.className = 'button-loader';
        for (let i = 0; i < 8; i++) {
            const segment = document.createElement('span');
            segment.className = 'loader-segment';
            segment.style.setProperty('--segment-index', i);
            loader.appendChild(segment);
        }
        submitButton.prepend(loader);
    }
    
    setTimeout(() => form.submit(), 10);
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

let suppressCalendarOnError = false;

function validateForm(event) {
    let isValid = true;
    let firstEmptyField = null;
    const validations = [
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
            inputField.classList.add('error-input');
            if (!firstEmptyField) firstEmptyField = inputField;
            isValid = false;
        } else if (inputField && errorField) {
            errorField.classList.remove('show');
            errorField.classList.add('hide');
            inputField.classList.remove('error-input');
        }
    });

    if (firstEmptyField) {
        suppressCalendarOnError = firstEmptyField.id === 'date';
        firstEmptyField.focus();
        const rect = firstEmptyField.getBoundingClientRect();
        if (rect.top < 0 || rect.bottom > window.innerHeight) {
            setTimeout(() => {
                firstEmptyField.scrollIntoView({ block: 'center' });
            }, 150);
        }
        setTimeout(() => {
            suppressCalendarOnError = false;
        }, 300);
    }

    if (isValid) showLoaderAndSubmit(event);
    else event.preventDefault();
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

    setTimeout(() => {
        if (origin && destination && date) {
            if (origin.value.trim() && destination.value.trim() && !date.value.trim()) {
                date.focus();
                openMaterialCalendar();
            } else if (inputId === 'origin' && !destination.value.trim()) {
                destination.focus();
            } else if (inputId === 'destination' && !origin.value.trim()) {
                origin.focus();
            }
        }
        suppressEvents = false;
    }, 100);

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

function initializeCollapsibleSections() {
    const toggles = document.querySelectorAll('.collapsible-toggle');

    toggles.forEach(toggle => {
        toggle.addEventListener('click', () => {
            const targetId = toggle.getAttribute('data-target');
            const content = document.getElementById(targetId);
            const icon = toggle.querySelector('i');

            if (!content.style.maxHeight || content.style.maxHeight === "0px") {
                content.style.display = "block";
                content.style.maxHeight = content.scrollHeight + "px";
                content.classList.add('animated-fade-in');
                toggle.innerHTML = `<i class="fas fa-chevron-up"></i> Collapse to hide Released Seats`;
            } else {
                content.style.maxHeight = "0px";
                toggle.innerHTML = `<i class="fas fa-chevron-down"></i> Expand to view Released Seats`;
                setTimeout(() => {
                    content.style.display = "none";
                }, 300);
            }
        });
    });
}

function resetSubmitButton() {
    const submitButton = document.querySelector('#seatForm .btn-primary');
    if (submitButton) {
        submitButton.disabled = false;
        submitButton.style.opacity = '1';
        submitButton.style.cursor = 'pointer';
        const loader = submitButton.querySelector('.button-loader');
        if (loader) {
            loader.remove();
        }
        const existingIcon = submitButton.querySelector('.fas.fa-search');
        if (!existingIcon) {
            const searchIcon = document.createElement('i');
            searchIcon.className = 'fas fa-search';
            submitButton.prepend(searchIcon);
        }
    }
}

document.addEventListener('DOMContentLoaded', function () {
    Promise.all([loadStations(), loadBannerImage()]).then(() => {
        document.querySelectorAll('a[class^="btn-"], button[class^="btn-"]').forEach(el => {
            el.setAttribute('draggable', 'false');
        });

        const seatForm = document.getElementById("seatForm");
        if (seatForm) seatForm.addEventListener("submit", validateForm);

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
                        inputField.classList.remove('error-input');
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
        initializeCollapsibleSections();

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
        resetSubmitButton();
    });
    window.addEventListener('pageshow', function (event) {
        if (document.getElementById('seatForm')) {
            resetSubmitButton();
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
                    input.classList.remove('error-input');
                }

                const origin = document.getElementById('origin');
                const destination = document.getElementById('destination');
                setTimeout(() => {
                    if (origin && destination) {
                        if (!origin.value.trim()) {
                            origin.focus();
                        } else if (!destination.value.trim()) {
                            destination.focus();
                        }
                    }
                }, 200);
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

    input.addEventListener("focus", () => {
        if (!suppressCalendarOnError) openMaterialCalendar();
    });
    input.addEventListener("click", () => {
        if (!suppressCalendarOnError) openMaterialCalendar();
    });

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

const flyoutNotification = document.getElementById('flyoutNotification');
const flyoutMessage = document.getElementById('flyoutMessage');
const flyoutClose = document.getElementById('flyoutClose');

let isOffline = !navigator.onLine;
let slowConnectionTimeout = null;

function showFlyout(message, type, autoHideDelay = 0) {
    flyoutMessage.textContent = message;
    flyoutNotification.classList.remove('warning', 'success');
    flyoutNotification.classList.add(type, 'active');

    if (autoHideDelay > 0) {
        setTimeout(hideFlyout, autoHideDelay);
    }
}

function hideFlyout() {
    flyoutNotification.classList.remove('active');
}

function checkNetworkStatus() {
    if (!navigator.onLine && !isOffline) {
        isOffline = true;
        showFlyout('No Internet Connection. Please check your network.', 'warning');
    } else if (navigator.onLine && isOffline) {
        isOffline = false;
        showFlyout('Internet Connection Restored!', 'success', 5000);
    }
}

function checkConnectionSpeed() {
    if (isOffline) return;

    const startTime = performance.now();
    fetch('https://www.google.com', { method: 'HEAD', mode: 'no-cors' })
        .then(() => {
            const duration = performance.now() - startTime;
            if (duration > 2000) {
                clearTimeout(slowConnectionTimeout);
                showFlyout('Slow Internet Connection Detected.', 'warning', 7000);
                slowConnectionTimeout = setTimeout(checkConnectionSpeed, 30000);
            } else {
                slowConnectionTimeout = setTimeout(checkConnectionSpeed, 15000);
            }
        })
        .catch(() => {
            if (!isOffline) {
                showFlyout('Network Error. Please check your connection.', 'warning', 7000);
                slowConnectionTimeout = setTimeout(checkConnectionSpeed, 30000);
            }
        });
}

window.addEventListener('online', checkNetworkStatus);
window.addEventListener('offline', checkNetworkStatus);

flyoutClose.addEventListener('click', hideFlyout);

document.addEventListener('DOMContentLoaded', () => {
    checkNetworkStatus();
    if (navigator.onLine) {
        checkConnectionSpeed();
    }
});

(function setupBackToTopButton() {
    const btn = document.getElementById('backToTopBtn');
    if (!btn) return;

    let hideTimeout;
    let lastScrollY = window.scrollY;

    function showButton() {
        btn.classList.add('visible');
        clearTimeout(hideTimeout);
        hideTimeout = setTimeout(() => {
            btn.classList.remove('visible');
        }, 5000);
    }

    function handleScroll() {
        const scrollY = window.scrollY;
        if (scrollY > 300) {
            if (scrollY !== lastScrollY) showButton();
        } else {
            btn.classList.remove('visible');
        }
        lastScrollY = scrollY;
    }

    btn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    window.addEventListener('scroll', handleScroll);
})();