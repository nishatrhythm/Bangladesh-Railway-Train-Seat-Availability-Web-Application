document.documentElement.classList.add('js-enabled');

let stationData;
let currentLanguage = 'en'; // Track current language for station display

// Helper function to detect if text contains Bengali characters
function isBengaliText(text) {
    const bengaliRegex = /[\u0980-\u09FF]/;
    return bengaliRegex.test(text);
}

// Helper function to check if search term matches station in either language
function stationMatchesSearch(station, searchTerm) {
    if (typeof station === 'string') {
        return station.toLowerCase().includes(searchTerm);
    }
    return station.en.toLowerCase().includes(searchTerm) || 
           station.bn.toLowerCase().includes(searchTerm);
}

// Helper function to get formatted station display based on input language
function getSmartStationDisplay(station, inputText) {
    if (typeof station === 'string') {
        return station;
    }
    
    // Detect if user is typing in Bengali or English
    const isUserTypingBengali = isBengaliText(inputText);
    
    if (isUserTypingBengali) {
        return station.bn;
    } else {
        return station.en;
    }
}

// Helper function to get formatted station display with both languages (legacy - for language toggle)
function getFormattedStationDisplay(station) {
    if (typeof station === 'string') {
        return station;
    }
    
    // Always show both languages: Primary (Secondary)
    if (currentLanguage === 'bn') {
        return `${station.bn} (${station.en})`;
    } else {
        return `${station.en} (${station.bn})`;
    }
}

// Helper function to get the primary station name for input field
function getPrimaryStationName(station) {
    if (typeof station === 'string') {
        return station;
    }
    return currentLanguage === 'bn' ? station.bn : station.en;
}

// Helper function to get station English name for API calls
function getStationApiName(station) {
    if (typeof station === 'string') {
        // Handle old format fallback
        return station;
    }
    return station.en;
}

// Helper function to find station object by display name (English or Bengali)
function findStationByName(displayName) {
    if (!stationData) return null;
    return stationData.find(station => {
        if (typeof station === 'string') {
            return station === displayName;
        }
        return station.en === displayName || station.bn === displayName;
    });
}

function loadStations() {
    return new Promise((resolve) => {
        const cachedStations = localStorage.getItem('railwayStations');
        const stationsElement = document.getElementById('stations-data');
        let serverStations, serverVersion;

        if (stationsElement) {
            const data = JSON.parse(stationsElement.textContent);
            serverStations = data.stations;
            serverVersion = data.version || "2.0.0"; // Update version to force cache refresh
        } else {
            serverStations = [];
            serverVersion = "2.0.0";
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

// Helper function to update station submit field based on display value
function updateStationSubmitField(fieldId) {
    const displayField = document.getElementById(fieldId);
    const submitField = document.getElementById(fieldId + '_submit');
    
    if (!displayField || !submitField) return;
    
    const displayValue = displayField.value.trim();
    if (!displayValue) {
        submitField.value = '';
        return;
    }
    
    const station = findStationByName(displayValue);
    if (station) {
        submitField.value = getStationApiName(station);
    } else {
        // If no station found, use the display value as fallback
        submitField.value = displayValue;
    }
}

// Helper function to initialize station fields from server values
function initializeStationField(fieldId) {
    const displayField = document.getElementById(fieldId);
    const submitField = document.getElementById(fieldId + '_submit');
    
    if (!displayField || !submitField) return;
    
    const serverValue = displayField.value.trim();
    if (!serverValue) return;
    
    // Server provides English station names, find the station object
    const station = findStationByName(serverValue);
    if (station) {
        // Update display field to show name in user's current language
        displayField.value = getPrimaryStationName(station);
        // Ensure submit field has the English name
        submitField.value = getStationApiName(station);
    } else {
        // If station not found, keep the server value in both fields
        submitField.value = serverValue;
    }
}

function showLoaderAndSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const submitButton = form.querySelector('.btn-primary');
    const listIcon = submitButton.querySelector('.fas.fa-list');
    
    // Ensure hidden submit fields are up to date with display fields
    updateStationSubmitField('origin');
    updateStationSubmitField('destination');
    
    submitButton.disabled = true;
    submitButton.style.opacity = '0.6';
    submitButton.style.cursor = 'not-allowed';
    
    if (listIcon) {
        listIcon.remove();
        const loader = document.createElement('span');
        loader.className = 'button-loader';
        for (let i = 0; i < 8; i++) {
            const segment = document.createElement('span');
            segment.className = 'loader-segment';
            segment.style.setProperty('--segment-index', i);
            loader.appendChild(segment);
        }
        submitButton.prepend(loader);
        submitButton.innerHTML = loader.outerHTML + ' Collecting Seat Info...';
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

        const originClear = document.getElementById('originClear');
        const destinationClear = document.getElementById('destinationClear');
        if (originClear) updateClearButtonVisibility(originInput, originClear);
        if (destinationClear) updateClearButtonVisibility(destinationInput, destinationClear);
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
        .filter(station => {
            const matches = stationMatchesSearch(station, filter);
            if (!matches) return false;
            
            // Check if this station is already selected in the other field
            if (excludeStation) {
                const stationEn = typeof station === 'string' ? station : station.en;
                const stationBn = typeof station === 'string' ? station : station.bn;
                if (excludeStation === stationEn || excludeStation === stationBn) {
                    return false;
                }
            }
            
            return true;
        })
        .slice(0, 5);
    
    filteredStations.forEach(station => {
        const option = document.createElement('div');
        const smartDisplay = getSmartStationDisplay(station, input.value);
        const primaryName = getPrimaryStationName(station);
        
        option.innerHTML = smartDisplay;
        option.addEventListener('mousedown', () => selectOption(inputId, dropdownId, smartDisplay, station));
        dropdown.appendChild(option);
    });

    if (filteredStations.length === 0) {
        dropdown.style.display = "none";
    }
}

function selectOption(inputId, dropdownId, value, station) {
    suppressEvents = true;
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    if (!input || !dropdown) return;

    // Set the display value (user's preferred language)
    input.value = value;
    
    // Set the submit value (English for API)
    const submitFieldId = inputId + '_submit';
    const submitField = document.getElementById(submitFieldId);
    if (submitField && station) {
        submitField.value = getStationApiName(station);
    }
    
    dropdown.style.display = "none";

    const clearButtonId = inputId === 'origin' ? 'originClear' : 'destinationClear';
    const clearButton = document.getElementById(clearButtonId);
    if (clearButton) {
        updateClearButtonVisibility(input, clearButton);
    }

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

    function recalculateParentHeights(element) {
        let parent = element.closest('.train-details-content');
        if (parent && parent.style.maxHeight && parent.style.maxHeight !== "none" && !parent.classList.contains('auto-expanded')) {
            parent.style.maxHeight = parent.scrollHeight + "px";
        }
    }

    if (window.ResizeObserver) {
        const resizeObserver = new ResizeObserver(entries => {
            entries.forEach(entry => {
                const element = entry.target;
                if (element.classList.contains('collapsible-content') && 
                    element.style.maxHeight && 
                    element.style.maxHeight !== "0px" && 
                    element.style.maxHeight !== "none" &&
                    !element.classList.contains('auto-expanded')) {
                    element.style.maxHeight = element.scrollHeight + "px";
                }
            });
        });

        document.querySelectorAll('.train-details-content').forEach(element => {
            resizeObserver.observe(element);
        });
    }

    toggles.forEach(toggle => {
        toggle.addEventListener('click', () => {
            const targetId = toggle.getAttribute('data-target');
            const content = document.getElementById(targetId);
            const icon = toggle.querySelector('i');

            if (!content.style.maxHeight || content.style.maxHeight === "0px") {
                const toggleRect = toggle.getBoundingClientRect();
                const initialScrollTop = window.scrollY;
                const toggleOffsetFromTop = toggleRect.top + initialScrollTop;
                
                if (toggle.classList.contains('train-details-toggle')) {
                    const allTrainDetailsToggles = document.querySelectorAll('.train-details-toggle');
                    let hasCollapsedSections = false;
                    
                    allTrainDetailsToggles.forEach(otherToggle => {
                        if (otherToggle !== toggle) {
                            const otherTargetId = otherToggle.getAttribute('data-target');
                            const otherContent = document.getElementById(otherTargetId);
                            if (otherContent && otherContent.style.maxHeight && otherContent.style.maxHeight !== "0px") {
                                hasCollapsedSections = true;
                                otherContent.style.maxHeight = "0px";
                                otherContent.classList.remove('show');
                                otherToggle.innerHTML = `<i class="fas fa-chevron-down"></i> VIEW SEAT DETAILS`;
                                
                                const nestedToggles = otherContent.querySelectorAll('.collapsible-toggle:not(.train-details-toggle)');
                                nestedToggles.forEach(nestedToggle => {
                                    const nestedTargetId = nestedToggle.getAttribute('data-target');
                                    const nestedContent = document.getElementById(nestedTargetId);
                                    if (nestedContent && nestedContent.style.maxHeight && nestedContent.style.maxHeight !== "0px") {
                                        nestedContent.style.maxHeight = "0px";
                                        nestedToggle.innerHTML = `<i class="fas fa-chevron-down"></i> Expand to view Issued Ticket List`;
                                        setTimeout(() => {
                                            nestedContent.style.display = "none";
                                        }, 300);
                                    }
                                });
                                
                                setTimeout(() => {
                                    otherContent.style.display = "none";
                                }, 300);
                            }
                        }
                    });
                    
                    if (hasCollapsedSections) {
                        setTimeout(() => {
                            const newToggleRect = toggle.getBoundingClientRect();
                            const currentScrollTop = window.scrollY;
                            const newToggleOffsetFromTop = newToggleRect.top + currentScrollTop;
                            
                            const movement = newToggleOffsetFromTop - toggleOffsetFromTop;
                            
                            const trainCard = toggle.closest('.train-card, .card, .result-item, .train-item, .search-result') || toggle.closest('div[class*="train"], div[class*="card"], div[class*="result"]');
                            
                            if (trainCard) {
                                const cardRect = trainCard.getBoundingClientRect();
                                const cardOffsetFromTop = cardRect.top + window.scrollY;
                                const viewportHeight = window.innerHeight;
                                
                                const isCardNotFullyVisible = cardRect.top < 0 || cardRect.bottom > viewportHeight || Math.abs(movement) > 50;
                                
                                if (isCardNotFullyVisible) {
                                    const targetScrollTop = cardOffsetFromTop - 20;
                                    
                                    window.scrollTo({
                                        top: Math.max(0, targetScrollTop),
                                        behavior: 'smooth'
                                    });
                                }
                            } else {
                                if (Math.abs(movement) > 50) {
                                    const targetScrollTop = newToggleOffsetFromTop - 100;
                                    window.scrollTo({
                                        top: Math.max(0, targetScrollTop),
                                        behavior: 'smooth'
                                    });
                                }
                            }
                        }, 350);
                    }
                }
                
                content.style.display = "block";
                content.style.maxHeight = content.scrollHeight + "px";
                content.classList.add('animated-fade-in');
                
                if (toggle.classList.contains('train-details-toggle')) {
                    toggle.innerHTML = `<i class="fas fa-chevron-up"></i> HIDE SEAT DETAILS`;
                    content.classList.add('show');
                } else {
                    toggle.innerHTML = `<i class="fas fa-chevron-up"></i> Collapse to hide Issued Ticket List`;
                    
                    recalculateParentHeights(content);
                    
                    requestAnimationFrame(() => {
                        recalculateParentHeights(content);
                    });
                }
            } else {
                content.style.maxHeight = "0px";
                content.classList.remove('show');
                
                if (toggle.classList.contains('train-details-toggle')) {
                    toggle.innerHTML = `<i class="fas fa-chevron-down"></i> VIEW SEAT DETAILS`;
                    
                    const nestedToggles = content.querySelectorAll('.collapsible-toggle:not(.train-details-toggle)');
                    nestedToggles.forEach(nestedToggle => {
                        const nestedTargetId = nestedToggle.getAttribute('data-target');
                        const nestedContent = document.getElementById(nestedTargetId);
                        if (nestedContent && nestedContent.style.maxHeight && nestedContent.style.maxHeight !== "0px") {
                            nestedContent.style.maxHeight = "0px";
                            nestedToggle.innerHTML = `<i class="fas fa-chevron-down"></i> Expand to view Issued Ticket List`;
                            setTimeout(() => {
                                nestedContent.style.display = "none";
                            }, 300);
                        }
                    });
                } else {
                    toggle.innerHTML = `<i class="fas fa-chevron-down"></i> Expand to view Issued Ticket List`;
                    
                    setTimeout(() => {
                        recalculateParentHeights(content);
                    }, 320);
                }
                
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
        const existingIcon = submitButton.querySelector('.fas.fa-list');
        if (!existingIcon) {
            const listIcon = document.createElement('i');
            listIcon.className = 'fas fa-list';
            submitButton.prepend(listIcon);
        }
    }
}

document.addEventListener('DOMContentLoaded', function () {
    const seatForm = document.getElementById("seatForm");
    if (seatForm) seatForm.addEventListener("submit", validateForm);

    // Initialize translations first
    initializeTranslations().then(() => {
        Promise.all([loadStations(), loadBannerImage()]).then(() => {
            document.querySelectorAll('a[class^="btn-"], button[class^="btn-"]').forEach(el => {
                el.setAttribute('draggable', 'false');
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

            setupClearButton('origin', 'originClear');
            setupClearButton('destination', 'destinationClear');
            
            // Initialize date field display based on current language
            updateDateFieldDisplay();
            
            // Initialize station fields from server values (convert English to user's language for display)
            initializeStationField('origin');
            initializeStationField('destination');

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
            const closeModal = document.querySelector('.close-modal-text');
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
    const monthAbbr = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];
    
    const day = String(date.getDate()).padStart(2, '0');
    const month = monthAbbr[date.getMonth()];
    const year = date.getFullYear();
    
    return `${day}-${month}-${year}`;
}

// Bengali month abbreviations
const bengaliMonthAbbr = [
    "জানু", "ফেব্রু", "মার্চ", "এপ্রিল", "মে", "জুন",
    "জুলাই", "আগস্ট", "সেপ্টে", "অক্টো", "নভে", "ডিসে"
];

function formatDateBengali(date) {
    const day = convertToBengaliDigits(String(date.getDate()).padStart(2, '0'));
    const month = bengaliMonths[date.getMonth()];
    const year = convertToBengaliDigits(String(date.getFullYear()));
    
    return `${day}-${month}-${year}`;
}

function formatDateForDisplay(date) {
    if (currentLanguage === 'bn') {
        return formatDateBengali(date);
    } else {
        return formatDate(date);
    }
}

function parseDate(dateStr) {
    const [day, monthStr, year] = dateStr.split("-");
    
    // First, try to parse as English format
    let monthIndex = new Date(`${monthStr} 1, 2000`).getMonth();
    
    // If that fails (returns NaN), try Bengali month names (both full and abbreviated)
    if (isNaN(monthIndex)) {
        monthIndex = bengaliMonths.indexOf(monthStr);
        if (monthIndex === -1) {
            monthIndex = bengaliMonthAbbr.indexOf(monthStr);
        }
    }
    
    // Convert Bengali digits to English if needed
    const englishDay = convertFromBengaliDigits(day);
    const englishYear = convertFromBengaliDigits(year);
    
    return new Date(englishYear, monthIndex, parseInt(englishDay, 10));
}

function convertFromBengaliDigits(text) {
    const englishDigitMap = {
        '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
        '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9'
    };
    return text.replace(/[০-৯]/g, (digit) => englishDigitMap[digit] || digit);
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
                // Set display value (Bengali if language is Bengali, English otherwise)
                input.value = formatDateForDisplay(currentClone);
                
                // Set submission value (always English format)
                const dateSubmitField = document.getElementById('date_submit');
                if (dateSubmitField) {
                    dateSubmitField.value = formatDate(currentClone);
                }
                
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
    
    updateCalendarDates();
    
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
    
    if (input && input.value) {
        try {
            const selectedDate = parseDate(input.value);
            calendarCurrentMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
        } catch (e) {
            calendarCurrentMonth = new Date(calendarMinDate.getFullYear(), calendarMinDate.getMonth(), 1);
        }
    } else {
        calendarCurrentMonth = new Date(calendarMinDate.getFullYear(), calendarMinDate.getMonth(), 1);
    }

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
                showFlyout('Slow Internet Connection.', 'warning', 7000);
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

function openModal(modalId, event) {
    if (event) {
        event.preventDefault();
    }
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

document.addEventListener('click', function(event) {
    if (event.target.classList.contains('legal-modal')) {
        const modalId = event.target.id;
        closeModal(modalId);
    }
});

document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        const activeModals = document.querySelectorAll('.legal-modal[style*="display: block"]');
        activeModals.forEach(modal => {
            closeModal(modal.id);
        });
    }
});

function setupClearButton(inputId, clearButtonId) {
    const input = document.getElementById(inputId);
    const clearButton = document.getElementById(clearButtonId);

    if (!input || !clearButton) return;

    updateClearButtonVisibility(input, clearButton);

    input.addEventListener('input', () => {
        updateClearButtonVisibility(input, clearButton);
    });

    clearButton.addEventListener('click', () => {
        input.value = '';
        input.focus();
        updateClearButtonVisibility(input, clearButton);

        const dropdownId = inputId === 'origin' ? 'originDropdown' : 'destinationDropdown';
        hideDropdown(dropdownId);

        const inputEvent = new Event('input', { bubbles: true });
        input.dispatchEvent(inputEvent);
    });
}

function updateClearButtonVisibility(input, clearButton) {
    if (input.value.trim() !== '') {
        clearButton.style.display = 'flex';
    } else {
        clearButton.style.display = 'none';
    }
}

// Translation functionality
let translations = {};

// Bengali digit mapping
const bengaliDigits = {
    '0': '০', '1': '১', '2': '২', '3': '৩', '4': '৪',
    '5': '৫', '6': '৬', '7': '৭', '8': '৮', '9': '৯'
};

// Month names in Bengali
const bengaliMonths = [
    'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
    'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'
];

function convertToBengaliDigits(text) {
    return text.replace(/[0-9]/g, (digit) => bengaliDigits[digit] || digit);
}

function convertToEnglishDigits(text) {
    const englishDigits = Object.fromEntries(
        Object.entries(bengaliDigits).map(([eng, ben]) => [ben, eng])
    );
    return text.replace(/[০-৯]/g, (digit) => englishDigits[digit] || digit);
}

async function loadTranslations() {
    try {
        const response = await fetch('/translations.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        translations = await response.json();
        console.log('Translations loaded successfully:', translations);
    } catch (error) {
        console.error('Failed to load translations:', error);
        // Fallback to embedded translations if fetch fails
        translations = {
            en: { 
                page_title: "BR Train Seat Availability",
                "form": {
                    "origin_label": "Origin Station",
                    "destination_label": "Destination Station",
                    "date_label": "Date of Journey",
                    "origin_placeholder": "Type or select an origin station",
                    "destination_placeholder": "Type or select a destination station",
                    "date_placeholder": "Select a date",
                    "origin_error": "Origin Station is required",
                    "destination_error": "Destination Station is required",
                    "date_error": "Date of Journey is required",
                    "submit_button": "View Seat Info"
                }
            },
            bn: { 
                page_title: "বিআর ট্রেন সিট প্রাপ্যতা",
                "form": {
                    "origin_label": "যাত্রার শুরুর স্টেশন",
                    "destination_label": "গন্তব্য স্টেশন",
                    "date_label": "যাত্রার তারিখ",
                    "origin_placeholder": "শুরুর স্টেশনের নাম টাইপ করুন বা নির্বাচন করুন",
                    "destination_placeholder": "গন্তব্য স্টেশনের নাম টাইপ করুন বা নির্বাচন করুন",
                    "date_placeholder": "একটি তারিখ নির্বাচন করুন",
                    "origin_error": "যাত্রার শুরুর স্টেশন প্রয়োজন",
                    "destination_error": "গন্তব্য স্টেশন প্রয়োজন",
                    "date_error": "যাত্রার তারিখ প্রয়োজন",
                    "submit_button": "সিট তথ্য দেখুন"
                }
            }
        };
        console.log('Using fallback translations:', translations);
    }
}

function getTranslation(key, lang = currentLanguage) {
    if (!translations[lang]) {
        return key;
    }
    
    const keys = key.split('.');
    let value = translations[lang];
    
    for (const k of keys) {
        if (value && typeof value === 'object' && value.hasOwnProperty(k)) {
            value = value[k];
        } else {
            // If key not found, return the original key or try English fallback
            if (lang !== 'en' && translations['en']) {
                return getTranslation(key, 'en');
            }
            return key;
        }
    }
    
    return value || key;
}

function updateCalendarForLanguage() {
    const calendarWeekdays = document.getElementById('calendarWeekdays');
    if (calendarWeekdays && translations[currentLanguage] && translations[currentLanguage].calendar) {
        const weekdaySpans = calendarWeekdays.querySelectorAll('span');
        weekdaySpans.forEach((span, index) => {
            if (translations[currentLanguage].calendar.weekdays && translations[currentLanguage].calendar.weekdays[index]) {
                span.textContent = translations[currentLanguage].calendar.weekdays[index];
            }
        });
    }
    
    // Update calendar month display if calendar is open
    const calendarTitle = document.getElementById('calendarTitle');
    if (calendarTitle && calendarCurrentMonth) {
        if (currentLanguage === 'bn') {
            const monthIndex = calendarCurrentMonth.getMonth();
            const year = convertToBengaliDigits(calendarCurrentMonth.getFullYear().toString());
            calendarTitle.textContent = `${bengaliMonths[monthIndex]} ${year}`;
        } else {
            const options = { month: "long", year: "numeric" };
            calendarTitle.textContent = calendarCurrentMonth.toLocaleDateString("en-US", options);
        }
    }
    
    // Regenerate calendar if it's open
    const calendar = document.getElementById("materialCalendar");
    if (calendar && calendar.style.display === "block") {
        generateMaterialCalendar();
    }
}

function applyTranslations() {
    // Update elements with data-translate attribute
    document.querySelectorAll('[data-translate]').forEach(element => {
        const key = element.getAttribute('data-translate');
        const translation = getTranslation(key);
        element.textContent = translation;
    });
    
    // Update placeholder texts
    document.querySelectorAll('[data-translate-placeholder]').forEach(element => {
        const key = element.getAttribute('data-translate-placeholder');
        const translation = getTranslation(key);
        element.placeholder = translation;
    });
    
    // Update meta tags
    document.querySelectorAll('meta[data-translate-content]').forEach(element => {
        const key = element.getAttribute('data-translate-content');
        const translation = getTranslation(key);
        element.content = translation;
    });
    
    // Update title
    const titleElement = document.querySelector('title[data-translate]');
    if (titleElement) {
        const key = titleElement.getAttribute('data-translate');
        const translation = getTranslation(key);
        titleElement.textContent = translation;
    }
    
    // Update form validation error messages
    updateValidationMessages();
    
    // Update modal content
    updateModalContent();
    
    // Update calendar
    updateCalendarForLanguage();
    
    // Apply font family and language attributes
    if (currentLanguage === 'bn') {
        document.documentElement.lang = 'bn';
        document.body.classList.add('bengali-text');
        // Convert numbers to Bengali digits
        convertNumbersToBengali();
    } else {
        document.documentElement.lang = 'en';
        document.body.classList.remove('bengali-text');
        // Convert numbers back to English digits
        convertNumbersToEnglish();
    }
}

function convertNumbersToBengali() {
    // Convert all visible numbers to Bengali digits
    document.querySelectorAll('*:not(script):not(style)').forEach(element => {
        if (element.childNodes) {
            element.childNodes.forEach(node => {
                if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
                    node.textContent = convertToBengaliDigits(node.textContent);
                }
            });
        }
    });
}

function convertNumbersToEnglish() {
    // Convert all Bengali digits back to English
    document.querySelectorAll('*:not(script):not(style)').forEach(element => {
        if (element.childNodes) {
            element.childNodes.forEach(node => {
                if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
                    node.textContent = convertToEnglishDigits(node.textContent);
                }
            });
        }
    });
}

function updateValidationMessages() {
    const validationFields = [
        { id: 'origin-error', key: 'form.origin_error' },
        { id: 'destination-error', key: 'form.destination_error' },
        { id: 'date-error', key: 'form.date_error' }
    ];
    
    validationFields.forEach(field => {
        const element = document.getElementById(field.id);
        if (element) {
            element.textContent = getTranslation(field.key);
        }
    });
}

function updateModalContent() {
    // Update Terms and Conditions modal
    const termsModal = document.getElementById('termsModal');
    if (termsModal) {
        const modalBody = termsModal.querySelector('.legal-modal-body');
        if (modalBody) {
            const serviceItems = getTranslation('terms.service_items');
            const allowedItems = getTranslation('terms.use_policy_allowed');
            const forbiddenItems = getTranslation('terms.use_policy_forbidden');
            const dataSourcesItems = getTranslation('terms.data_sources_items');
            const limitationsItems = getTranslation('terms.limitations_items');
            
            modalBody.innerHTML = `
                <h2 data-translate="terms.title">${getTranslation('terms.title')}</h2>
                <p><strong data-translate="terms.effective_date">${getTranslation('terms.effective_date')}</strong></p>
                <hr>

                <h3 data-translate="terms.intro_title">${getTranslation('terms.intro_title')}</h3>
                <p data-translate="terms.intro_text">${getTranslation('terms.intro_text')}</p>

                <h3 data-translate="terms.service_title">${getTranslation('terms.service_title')}</h3>
                <p data-translate="terms.service_text">${getTranslation('terms.service_text')}</p>
                <ul>
                    ${Array.isArray(serviceItems) ? serviceItems.map(item => `<li>${item}</li>`).join('') : '<li>Service items not available</li>'}
                </ul>

                <h3 data-translate="terms.use_policy_title">${getTranslation('terms.use_policy_title')}</h3>
                <p><strong data-translate="terms.use_policy_allowed_title">${getTranslation('terms.use_policy_allowed_title')}</strong></p>
                <ul>
                    ${Array.isArray(allowedItems) ? allowedItems.map(item => `<li>${item}</li>`).join('') : '<li>Allowed items not available</li>'}
                </ul>

                <p><strong data-translate="terms.use_policy_forbidden_title">${getTranslation('terms.use_policy_forbidden_title')}</strong></p>
                <ul>
                    ${Array.isArray(forbiddenItems) ? forbiddenItems.map(item => `<li>${item}</li>`).join('') : '<li>Forbidden items not available</li>'}
                </ul>

                <h3 data-translate="terms.data_sources_title">${getTranslation('terms.data_sources_title')}</h3>
                <p data-translate="terms.data_sources_text">${getTranslation('terms.data_sources_text')}</p>
                <ul>
                    ${Array.isArray(dataSourcesItems) ? dataSourcesItems.map(item => `<li>${item}</li>`).join('') : '<li>Data sources not available</li>'}
                </ul>
                <p data-translate="terms.data_sources_disclaimer">${getTranslation('terms.data_sources_disclaimer')}</p>

                <h3 data-translate="terms.limitations_title">${getTranslation('terms.limitations_title')}</h3>
                <p data-translate="terms.limitations_text">${getTranslation('terms.limitations_text')}</p>
                <ul>
                    ${Array.isArray(limitationsItems) ? limitationsItems.map(item => `<li>${item}</li>`).join('') : '<li>Limitations not available</li>'}
                </ul>

                <h3 data-translate="terms.open_source_title">${getTranslation('terms.open_source_title')}</h3>
                <p data-translate="terms.open_source_text">${getTranslation('terms.open_source_text')}</p>

                <h3 data-translate="terms.liability_title">${getTranslation('terms.liability_title')}</h3>
                <p data-translate="terms.liability_text">${getTranslation('terms.liability_text')}</p>

                <h3 data-translate="terms.contact_title">${getTranslation('terms.contact_title')}</h3>
                <p data-translate="terms.contact_text">${getTranslation('terms.contact_text')}</p>

                <hr>
                <p><strong data-translate="terms.agreement_text">${getTranslation('terms.agreement_text')}</strong></p>
            `;
        }
    }

    // Update Privacy Policy modal
    const privacyModal = document.getElementById('privacyModal');
    if (privacyModal) {
        const modalBody = privacyModal.querySelector('.legal-modal-body');
        if (modalBody) {
            const noCollectItems = getTranslation('privacy.no_collect_items');
            const tempProcessItems = getTranslation('privacy.temp_process_items');
            const technicalItems = getTranslation('privacy.technical_items');
            const thirdPartyItems = getTranslation('privacy.third_party_items');
            const browserStorageItems = getTranslation('privacy.browser_storage_items');
            const securityItems = getTranslation('privacy.security_items');
            
            modalBody.innerHTML = `
                <h2 data-translate="privacy.title">${getTranslation('privacy.title')}</h2>
                <p><strong data-translate="privacy.effective_date">${getTranslation('privacy.effective_date')}</strong></p>
                <hr>

                <h3 data-translate="privacy.intro_title">${getTranslation('privacy.intro_title')}</h3>
                <p data-translate="privacy.intro_text">${getTranslation('privacy.intro_text')}</p>

                <h3 data-translate="privacy.no_collect_title">${getTranslation('privacy.no_collect_title')}</h3>
                <p><strong data-translate="privacy.no_collect_subtitle">${getTranslation('privacy.no_collect_subtitle')}</strong></p>
                <ul>
                    ${Array.isArray(noCollectItems) ? noCollectItems.map(item => `<li>${item}</li>`).join('') : '<li>Items not available</li>'}
                </ul>

                <h3 data-translate="privacy.temp_process_title">${getTranslation('privacy.temp_process_title')}</h3>
                <p><strong data-translate="privacy.temp_process_subtitle">${getTranslation('privacy.temp_process_subtitle')}</strong></p>
                <ul>
                    ${Array.isArray(tempProcessItems) ? tempProcessItems.map(item => `<li>${item}</li>`).join('') : '<li>Items not available</li>'}
                </ul>
                <p data-translate="privacy.temp_process_note">${getTranslation('privacy.temp_process_note')}</p>

                <h3 data-translate="privacy.technical_title">${getTranslation('privacy.technical_title')}</h3>
                <p><strong data-translate="privacy.technical_subtitle">${getTranslation('privacy.technical_subtitle')}</strong></p>
                <ul>
                    ${Array.isArray(technicalItems) ? technicalItems.map(item => `<li>${item}</li>`).join('') : '<li>Items not available</li>'}
                </ul>
                <p data-translate="privacy.technical_note">${getTranslation('privacy.technical_note')}</p>

                <h3 data-translate="privacy.third_party_title">${getTranslation('privacy.third_party_title')}</h3>
                <p><strong data-translate="privacy.third_party_subtitle">${getTranslation('privacy.third_party_subtitle')}</strong></p>
                <ul>
                    ${Array.isArray(thirdPartyItems) ? thirdPartyItems.map(item => `<li>${item}</li>`).join('') : '<li>Items not available</li>'}
                </ul>
                <p data-translate="privacy.third_party_note">${getTranslation('privacy.third_party_note')}</p>

                <h3 data-translate="privacy.browser_storage_title">${getTranslation('privacy.browser_storage_title')}</h3>
                <p><strong data-translate="privacy.browser_storage_subtitle">${getTranslation('privacy.browser_storage_subtitle')}</strong></p>
                <ul>
                    ${Array.isArray(browserStorageItems) ? browserStorageItems.map(item => `<li>${item}</li>`).join('') : '<li>Items not available</li>'}
                </ul>
                <p data-translate="privacy.browser_storage_note">${getTranslation('privacy.browser_storage_note')}</p>

                <h3 data-translate="privacy.security_title">${getTranslation('privacy.security_title')}</h3>
                <p><strong data-translate="privacy.security_subtitle">${getTranslation('privacy.security_subtitle')}</strong></p>
                <ul>
                    ${Array.isArray(securityItems) ? securityItems.map(item => `<li>${item}</li>`).join('') : '<li>Items not available</li>'}
                </ul>

                <h3 data-translate="privacy.open_source_title">${getTranslation('privacy.open_source_title')}</h3>
                <p data-translate="privacy.open_source_text">${getTranslation('privacy.open_source_text')}</p>

                <h3 data-translate="privacy.no_sharing_title">${getTranslation('privacy.no_sharing_title')}</h3>
                <p data-translate="privacy.no_sharing_text">${getTranslation('privacy.no_sharing_text')}</p>

                <h3 data-translate="privacy.changes_title">${getTranslation('privacy.changes_title')}</h3>
                <p data-translate="privacy.changes_text">${getTranslation('privacy.changes_text')}</p>

                <h3 data-translate="privacy.contact_title">${getTranslation('privacy.contact_title')}</h3>
                <p data-translate="privacy.contact_text">${getTranslation('privacy.contact_text')}</p>

                <hr>
                <p><strong data-translate="privacy.agreement_text">${getTranslation('privacy.agreement_text')}</strong></p>
            `;
        }
    }
}

// Function to update error messages instantly when language changes
function updateErrorMessages() {
    const errorElement = document.querySelector('.error[data-error-key]');
    if (!errorElement) return;
    
    const errorKey = errorElement.getAttribute('data-error-key');
    if (!errorKey) return;
    
    // Check if we have translations loaded
    if (!translations || !translations[currentLanguage] || !translations[currentLanguage].errors) {
        return;
    }
    
    const translation = translations[currentLanguage].errors[errorKey];
    if (!translation) return;
    
    // Update the error text while preserving the icon
    const iconElement = errorElement.querySelector('.error-icon');
    if (iconElement) {
        errorElement.innerHTML = iconElement.outerHTML + ' ' + translation;
    } else {
        errorElement.textContent = translation;
    }
}

function switchLanguage(lang) {
    console.log('Switching language to:', lang);
    currentLanguage = lang;
    
    // Update language toggle button
    const toggleBtn = document.getElementById('languageToggle');
    if (toggleBtn) {
        const langText = toggleBtn.querySelector('.lang-text');
        toggleBtn.setAttribute('data-lang', lang);
        
        // Show opposite language text (what will be switched to on next click)
        if (lang === 'en') {
            langText.textContent = 'বাংলা';
        } else {
            langText.textContent = 'English';
        }
    }
    
    // Update station field displays based on new language
    updateStationFieldDisplay('origin');
    updateStationFieldDisplay('destination');
    
    // Update date field display based on new language
    updateDateFieldDisplay();
    
    // Apply translations
    applyTranslations();
    
    // Update error messages instantly
    updateErrorMessages();
    
    // Save language preference
    localStorage.setItem('preferredLanguage', lang);
    
    // Send language preference to server
    fetch('/set_language', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ lang: lang })
    }).catch(error => {
        console.error('Error setting language on server:', error);
    });
    
    // Update HTML lang attribute
    document.documentElement.lang = lang;
    
    console.log('Language switched to:', lang, 'Current translations:', translations[lang]);
}

// Helper function to update station field display when language changes
function updateStationFieldDisplay(fieldId) {
    const field = document.getElementById(fieldId);
    if (!field || !field.value) return;
    
    const currentValue = field.value.trim();
    const station = findStationByName(currentValue);
    
    if (station) {
        // Update the display to show the station name in the current language
        field.value = getPrimaryStationName(station);
        
        // Also update the hidden submit field
        const submitField = document.getElementById(fieldId + '_submit');
        if (submitField) {
            submitField.value = getStationApiName(station);
        }
    }
}

// Helper function to update date field display when language changes
function updateDateFieldDisplay() {
    const dateSubmitField = document.getElementById('date_submit');
    const dateDisplayField = document.getElementById('date');
    
    if (!dateDisplayField) return;
    
    // If there's no hidden field value but there's a display value, 
    // it means we have an initial value from the server
    if (!dateSubmitField.value && dateDisplayField.value) {
        try {
            // Try to parse the display value as an English date and populate the hidden field
            const date = parseDate(dateDisplayField.value);
            dateSubmitField.value = formatDate(date);
            // Now update the display based on current language
            dateDisplayField.value = formatDateForDisplay(date);
        } catch (error) {
            // If parsing fails, assume it's already in the correct format for current language
            console.warn('Could not parse initial date value:', dateDisplayField.value);
        }
    } else if (dateSubmitField.value) {
        try {
            // Parse the English format date from the hidden field
            const date = parseDate(dateSubmitField.value);
            // Update the display field with the appropriate language format
            dateDisplayField.value = formatDateForDisplay(date);
        } catch (error) {
            console.warn('Error updating date display:', error);
        }
    }
}

// Initialize translation system
async function initializeTranslations() {
    await loadTranslations();
    
    // Get saved language preference or default to English
    const savedLang = localStorage.getItem('preferredLanguage') || 'en';
    currentLanguage = savedLang;
    
    // Set up language toggle button
    const toggleBtn = document.getElementById('languageToggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const currentLang = toggleBtn.getAttribute('data-lang');
            const newLang = currentLang === 'en' ? 'bn' : 'en';
            switchLanguage(newLang);
        });
    }
    
    // Apply initial language
    switchLanguage(currentLanguage);
}

// Override the existing generateMaterialCalendar function to support Bengali
const originalGenerateMaterialCalendar = generateMaterialCalendar;
generateMaterialCalendar = function() {
    originalGenerateMaterialCalendar.call(this);
    
    // Update calendar title and day numbers for Bengali
    if (currentLanguage === 'bn') {
        const calendarTitle = document.getElementById("calendarTitle");
        if (calendarTitle && calendarCurrentMonth) {
            const monthIndex = calendarCurrentMonth.getMonth();
            const year = convertToBengaliDigits(calendarCurrentMonth.getFullYear().toString());
            calendarTitle.textContent = `${bengaliMonths[monthIndex]} ${year}`;
        }
        
        // Convert day numbers to Bengali
        document.querySelectorAll('.calendar-day').forEach(dayBtn => {
            if (dayBtn.textContent && !isNaN(dayBtn.textContent)) {
                dayBtn.textContent = convertToBengaliDigits(dayBtn.textContent);
            }
        });
    }
};

// Override the existing validateForm function to support Bengali error messages
const originalValidateForm = validateForm;
validateForm = function(event) {
    let isValid = true;
    let firstEmptyField = null;
    const validations = [
        { id: 'origin', errorId: 'origin-error', messageKey: 'form.origin_error' },
        { id: 'destination', errorId: 'destination-error', messageKey: 'form.destination_error' },
        { id: 'date', errorId: 'date-error', messageKey: 'form.date_error' }
    ];

    validations.forEach(validation => {
        const inputField = document.getElementById(validation.id);
        const errorField = document.getElementById(validation.errorId);
        if (inputField && errorField && inputField.value.trim() === "") {
            const message = getTranslation(validation.messageKey);
            errorField.textContent = message;
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
};
