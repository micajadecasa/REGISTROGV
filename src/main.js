// ============= CONSTANTS =============
const SPANISH_HOLIDAYS_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQqv5n85zlFlRhK82ns2qvS-wQmaOpEyT7OmqxgEmOMS5kwmra-POIXomKKO-cfqSCy-MIJhWI7fnOS/pub?output=csv";

const NIGHT_START_HOUR = 22; // 22:00
const NIGHT_END_HOUR = 6;    // 06:00
const MONTHLY_HOURS_THRESHOLD = 162; // Standard monthly hours for security guards

const FALLBACK_HOLIDAYS = [
    '2024-01-01', '2024-01-06', '2024-03-28', '2024-03-29', '2024-05-01',
    '2024-08-15', '2024-10-12', '2024-11-01', '2024-12-06', '2024-12-08', '2024-12-25',
    '2025-01-01', '2025-01-06', '2025-04-17', '2025-04-18', '2025-05-01',
    '2025-08-15', '2025-10-12', '2025-11-01', '2025-12-06', '2025-12-08', '2025-12-25'
];

// ============= STATE MANAGEMENT =============
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let shifts = [];
let editingShiftId = null;
let holidays = []; // Will be populated from CSV

// ============= INITIALIZATION =============
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

async function initializeApp() {
    // Load theme preference
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);

    // Load shifts from localStorage
    loadShiftsFromStorage();

    // Fetch holidays
    await fetchHolidays();

    // Set up event listeners
    setupEventListeners();

    // Initial render
    updateMonthDisplay();
    renderShifts();
}

async function fetchHolidays() {
    // Directly use fallback holidays to avoid CORS issues locally
    holidays = FALLBACK_HOLIDAYS;
    console.log('Festivos cargados (modo local):', holidays.length);
}

function isHolidayDate(date) {
    // Check if weekend (Saturday or Sunday)
    const day = date.getDay();
    if (day === 0 || day === 6) return true;

    // Check against fetched holidays
    try {
        const dateString = date.toISOString().split('T')[0];
        if (holidays.includes(dateString)) return true;
    } catch (e) {
        return false;
    }
    return false;
}

// ============= EVENT LISTENERS =============
function setupEventListeners() {
    // Theme toggle
    const themeToggle = document.getElementById('theme-toggle');
    themeToggle.addEventListener('click', toggleTheme);

    // Month navigation
    document.getElementById('prev-month').addEventListener('click', () => navigateMonth(-1));
    document.getElementById('next-month').addEventListener('click', () => navigateMonth(1));

    // Add shift button
    document.getElementById('add-shift-btn').addEventListener('click', openAddShiftModal);

    // Shift Modal controls
    document.getElementById('close-modal').addEventListener('click', closeModal);
    document.getElementById('cancel-btn').addEventListener('click', closeModal);
    document.getElementById('shift-modal').addEventListener('click', (e) => {
        if (e.target.id === 'shift-modal') closeModal();
    });

    // Form submission
    document.getElementById('shift-form').addEventListener('submit', handleFormSubmit);

    // Export buttons
    document.getElementById('generate-pdf-btn').addEventListener('click', () => openExportModal('pdf'));

    // PDF/Excel Modal controls
    document.getElementById('close-pdf-modal').addEventListener('click', closePdfModal);
    document.getElementById('cancel-pdf-btn').addEventListener('click', closePdfModal);
    document.getElementById('pdf-settings-modal').addEventListener('click', (e) => {
        if (e.target.id === 'pdf-settings-modal') closePdfModal();
    });

    // Export Form submission
    document.getElementById('pdf-settings-form').addEventListener('submit', handleExportSubmission);

    // History button
    document.getElementById('history-btn').addEventListener('click', openHistoryModal);
    document.getElementById('close-history-modal').addEventListener('click', closeHistoryModal);
    document.getElementById('history-modal').addEventListener('click', (e) => {
        if (e.target.id === 'history-modal') closeHistoryModal();
    });

    // Holiday checkbox auto-detect
    const dateInput = document.getElementById('shift-date');
    const holidayCheckbox = document.getElementById('shift-holiday');

    dateInput.addEventListener('change', () => {
        if (!dateInput.value) return;
        const selectedDate = new Date(dateInput.value);
        if (isHolidayDate(selectedDate)) {
            holidayCheckbox.checked = true;
        } else {
            holidayCheckbox.checked = false;
        }
    });
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
}

// ============= MONTH NAVIGATION =============
function navigateMonth(direction) {
    currentMonth += direction;

    if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
    } else if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
    }

    updateMonthDisplay();
    renderShifts();
}

function updateMonthDisplay() {
    const monthNames = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    const monthDisplay = document.getElementById('current-month');
    monthDisplay.textContent = `${monthNames[currentMonth]} ${currentYear}`;
}

// ============= CALCULATIONS =============
function calculateTotalHours(date, startTime, endTime) {
    const start = new Date(`${date}T${startTime}`);
    let end = new Date(`${date}T${endTime}`);

    if (end <= start) {
        end.setDate(end.getDate() + 1);
    }

    const diffMs = end - start;
    const hours = diffMs / (1000 * 60 * 60);

    return Math.round(hours * 100) / 100;
}

function calculateHourTypes(date, startTime, endTime, isHolidayOverride) {
    const start = new Date(`${date}T${startTime}`);
    let end = new Date(`${date}T${endTime}`);

    if (end <= start) {
        end.setDate(end.getDate() + 1);
    }

    let totalMs = end - start;
    let totalHours = totalMs / (1000 * 60 * 60);

    let rawNightMs = 0;
    let rawHolidayMs = 0;
    let rawNormalMs = 0;


    // Iterate minute by minute for precision
    let current = new Date(start);
    while (current < end) {
        // Check if this minute is Night (22:00 - 06:00)
        const hour = current.getHours();
        const isNight = hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR;

        // Check if this minute is Holiday
        // 1. First check if this specific moment is naturally a holiday (Weekend or National)
        let isHolidayMinute = isHolidayDate(current);

        // 2. If user manually checked "Es festivo", apply it ONLY to the start day
        // This prevents a Sunday shift from incorrectly marking Monday morning as festive
        if (isHolidayOverride && !isHolidayMinute) {
            const isSameDayAsStart = current.getDate() === start.getDate() &&
                current.getMonth() === start.getMonth() &&
                current.getFullYear() === start.getFullYear();
            if (isSameDayAsStart) {
                isHolidayMinute = true;
            }
        }

        if (isNight) rawNightMs += 60000; // Add 1 minute

        if (isHolidayMinute) {
            rawHolidayMs += 60000;
        } else {
            if (!isNight) rawNormalMs += 60000;
        }

        current.setMinutes(current.getMinutes() + 1);
    }

    let nightHours = rawNightMs / (1000 * 60 * 60);
    let holidayHours = rawHolidayMs / (1000 * 60 * 60);
    let normalHours = rawNormalMs / (1000 * 60 * 60);

    // Spanish security convention: 4+ night hours = full shift counts as night (max 8h)
    if (nightHours >= 4) {
        // Cap at total hours or 8h
        nightHours = Math.min(totalHours, 8);

        // If converted to Night, reduce Normal.
        // If Holiday was 0, then Normal = Total - Night.
        if (!isHolidayOverride && holidayHours === 0) {
            normalHours = Math.max(0, totalHours - nightHours);
        }
        // If Holiday > 0, we assume Holiday hours take precedence over Normal, 
        // and Night hours (supplement) are compatible with Holiday.
        // But for the grid, we usually want to see "Holiday Hours" and "Night Hours".
        // Normal hours are those that are neither.
    }

    return {
        total: Math.round(totalHours * 100) / 100,
        normal: Math.round(normalHours * 100) / 100,
        night: Math.round(nightHours * 100) / 100,
        holiday: Math.round(holidayHours * 100) / 100,
        overtime: 0 // Will be calculated in monthly totals
    };
}

// ============= VALIDATIONS =============
function validateShift(date, startTime, endTime, currentShiftId = null) {
    const warnings = [];
    const errors = [];

    const shiftStart = new Date(`${date}T${startTime}`);
    let shiftEnd = new Date(`${date}T${endTime}`);
    if (shiftEnd <= shiftStart) shiftEnd.setDate(shiftEnd.getDate() + 1);

    // Rest period validation REMOVED to allow multiple shifts per day

    return { warnings, errors, isValid: errors.length === 0 };
}

// ============= MODAL MANAGEMENT =============
function openAddShiftModal() {
    editingShiftId = null;
    document.getElementById('modal-title').textContent = 'Añadir Turno';
    document.getElementById('shift-form').reset();
    document.getElementById('validation-messages').innerHTML = '';

    const today = new Date().toISOString().split('T')[0];
    document.getElementById('shift-date').value = today;

    if (isHolidayDate(new Date())) {
        document.getElementById('shift-holiday').checked = true;
    }

    document.getElementById('shift-modal').classList.add('show');
}

function openEditShiftModal(shiftId) {
    editingShiftId = shiftId;
    const shift = shifts.find(s => s.id === shiftId);
    if (!shift) return;

    document.getElementById('modal-title').textContent = 'Editar Turno';
    document.getElementById('shift-date').value = shift.date;
    document.getElementById('shift-start').value = shift.startTime;
    document.getElementById('shift-end').value = shift.endTime;
    document.getElementById('shift-holiday').checked = shift.isHoliday || false;
    document.getElementById('shift-notes').value = shift.notes || '';
    document.getElementById('validation-messages').innerHTML = '';

    document.getElementById('shift-modal').classList.add('show');
}

function closeModal() {
    document.getElementById('shift-modal').classList.remove('show');
    editingShiftId = null;
}

let currentExportType = 'pdf'; // 'pdf' or 'excel'

function openExportModal(type) {
    currentExportType = type;
    const monthShifts = getMonthShifts();

    if (monthShifts.length === 0) {
        alert('No hay turnos para exportar este mes.');
        return;
    }

    // Load saved profile
    const profile = JSON.parse(localStorage.getItem('userProfile') || '{}');
    if (profile.name) document.getElementById('worker-name').value = profile.name;
    if (profile.tip) document.getElementById('worker-tip').value = profile.tip;

    const btnText = type === 'pdf' ? 'Generar PDF' : 'Exportar Excel';
    document.querySelector('#pdf-settings-form button[type="submit"]').textContent = btnText;

    document.getElementById('pdf-settings-modal').classList.add('show');
}

function closePdfModal() {
    document.getElementById('pdf-settings-modal').classList.remove('show');
}

// ============= FORM HANDLING =============
function handleFormSubmit(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const date = formData.get('date');
    const startTime = formData.get('startTime');
    const endTime = formData.get('endTime');
    const isHoliday = formData.get('isHoliday') === 'on';
    const notes = formData.get('notes') || '';

    const validation = validateShift(date, startTime, endTime, editingShiftId);

    const validationDiv = document.getElementById('validation-messages');
    validationDiv.innerHTML = '';

    if (validation.warnings.length > 0 || validation.errors.length > 0) {
        const messages = [...validation.errors, ...validation.warnings];
        validationDiv.innerHTML = messages.map(msg => `<div class="${msg.startsWith('❌') ? 'error-message' : 'warning-message'}">${msg}</div>`).join('');
    }

    if (!validation.isValid) return;

    const hours = calculateHourTypes(date, startTime, endTime, isHoliday);

    const shiftData = {
        id: editingShiftId || generateId(),
        date,
        startTime,
        endTime,
        isHoliday,
        hours,
        notes,
        warnings: validation.warnings
    };

    if (editingShiftId) {
        const index = shifts.findIndex(s => s.id === editingShiftId);
        if (index !== -1) shifts[index] = shiftData;
    } else {
        shifts.push(shiftData);
    }

    shifts.sort((a, b) => new Date(b.date) - new Date(a.date));

    saveShiftsToStorage();
    renderShifts();
    closeModal();
}

function handleExportSubmission(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const workerName = formData.get('workerName');
    const workerTip = formData.get('workerTip');

    // Save profile
    localStorage.setItem('userProfile', JSON.stringify({
        name: workerName,
        tip: workerTip
    }));

    if (currentExportType === 'pdf') {
        generatePDF(workerName, workerTip);
    }

    closePdfModal();
}

// ============= EXPORT GENERATION =============
function getMonthShifts() {
    return shifts.filter(shift => {
        const shiftDate = new Date(shift.date);
        return shiftDate.getMonth() === currentMonth && shiftDate.getFullYear() === currentYear;
    }).sort((a, b) => new Date(a.date) - new Date(b.date));
}

async function generatePDF(workerName, workerTip) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Fonts
    doc.setFont("helvetica");

    // Header
    doc.setFontSize(18);
    doc.text("Registro de Horas Gasteiz de Vigilancia", 105, 20, { align: "center" });

    doc.setFontSize(12);
    doc.text(`Trabajador: ${workerName}`, 14, 35);
    if (workerTip) doc.text(`TIP: ${workerTip}`, 14, 42);

    const monthNames = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    doc.text(`Mes: ${monthNames[currentMonth]} ${currentYear}`, 14, 55);

    const monthShifts = getMonthShifts();

    // Table Data
    const tableData = monthShifts.map(shift => {
        const date = new Date(shift.date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
        return [
            date + (shift.isHoliday ? ' (F)' : ''),
            shift.startTime,
            shift.endTime,
            shift.hours.total.toFixed(2) + 'h',
            shift.hours.night.toFixed(2) + 'h',
            shift.hours.holiday.toFixed(2) + 'h',
            shift.notes || '-'
        ];
    });

    // Totals for Summary
    const totals = monthShifts.reduce((acc, shift) => ({
        total: acc.total + shift.hours.total,
        night: acc.night + shift.hours.night,
        holiday: acc.holiday + shift.hours.holiday
    }), { total: 0, night: 0, holiday: 0 });

    const overtime = Math.max(0, totals.total - MONTHLY_HOURS_THRESHOLD);

    // Service Breakdown
    const serviceTotals = {};
    monthShifts.forEach(shift => {
        const service = shift.notes || 'Sin Servicio';
        if (!serviceTotals[service]) serviceTotals[service] = 0;
        serviceTotals[service] += shift.hours.total;
    });

    // AutoTable
    doc.autoTable({
        startY: 65,
        head: [['Fecha', 'Entrada', 'Salida', 'Total', 'Nocturnas', 'Festivas', 'Servicio']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [220, 38, 38] }, // Red
        styles: { fontSize: 10, cellPadding: 3 },
        margin: { right: 60 } // Leave space for sidebar
    });

    // Sidebar Summary
    const finalY = doc.lastAutoTable.finalY || 65;
    const summaryX = 150;
    const summaryY = 65;

    doc.setFillColor(245, 245, 245);
    doc.rect(summaryX, summaryY, 50, 60, 'F');

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Resumen", summaryX + 5, summaryY + 10);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Total: ${totals.total.toFixed(2)}h`, summaryX + 5, summaryY + 20);
    doc.text(`Nocturnas: ${totals.night.toFixed(2)}h`, summaryX + 5, summaryY + 30);
    doc.text(`Festivas: ${totals.holiday.toFixed(2)}h`, summaryX + 5, summaryY + 40);
    doc.text(`Extras: ${overtime.toFixed(2)}h`, summaryX + 5, summaryY + 50);

    // Service Breakdown in Sidebar
    let serviceY = summaryY + 70;
    doc.setFont("helvetica", "bold");
    doc.text("Por Servicio", summaryX + 5, serviceY);
    serviceY += 10;

    doc.setFont("helvetica", "normal");
    for (const [service, hours] of Object.entries(serviceTotals)) {
        doc.text(`${service}: ${hours.toFixed(2)}h`, summaryX + 5, serviceY);
        serviceY += 7;
    }

    // Generate filename
    const filename = `Registro_Horas_${monthNames[currentMonth]}_${currentYear}.pdf`;

    // Save locally
    doc.save(filename);

    // Save to cloud if user is authenticated and option is checked
    const saveToCloudCheckbox = document.getElementById('save-to-cloud');
    if (window.authModule && saveToCloudCheckbox && saveToCloudCheckbox.checked) {
        const currentUser = window.authModule.currentUser();
        const provider = window.authModule.authProvider();

        if (currentUser && !currentUser.isGuest) {
            // Convert PDF to blob
            const pdfBlob = doc.output('blob');

            // Save to appropriate cloud storage
            if (provider === 'google') {
                window.authModule.saveToGoogleDrive(pdfBlob, filename);
            } else if (provider === 'microsoft') {
                window.authModule.saveToOneDrive(pdfBlob, filename);
            }
        }
    }
}

// ============= RENDERING =============
function renderShifts() {
    const tbody = document.getElementById('shifts-tbody');
    const emptyState = document.getElementById('empty-state');
    const table = document.getElementById('shifts-table');
    const monthShifts = getMonthShifts();

    if (monthShifts.length === 0) {
        table.style.display = 'none';
        emptyState.classList.add('show');
        updateMonthlyTotals({ total: 0, normal: 0, night: 0, holiday: 0, overtime: 0 });
        return;
    }

    table.style.display = 'table';
    emptyState.classList.remove('show');

    tbody.innerHTML = monthShifts.map(shift => {
        const date = new Date(shift.date);
        const formattedDate = date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
        const holidayIcon = shift.isHoliday ? '🎉' : '';

        return `
      <tr class="${shift.isHoliday ? 'holiday-row' : ''}">
        <td>${formattedDate} ${holidayIcon}</td>
        <td>${shift.startTime}</td>
        <td>${shift.endTime}</td>
        <td class="hours-cell">${shift.hours.total.toFixed(2)}h</td>
        <td class="hours-cell night-hours">${shift.hours.night.toFixed(2)}h</td>
        <td class="hours-cell holiday-hours">${shift.hours.holiday.toFixed(2)}h</td>
        <td class="hours-cell overtime-hours">-</td>
        <td class="notes-column">${shift.notes || '-'}</td>
        <td>
          <div class="actions-cell">
            <button class="action-btn edit" onclick="window.editShift('${shift.id}')">Editar</button>
            <button class="action-btn delete" onclick="window.deleteShift('${shift.id}')">Borrar</button>
          </div>
        </td>
      </tr>
    `;
    }).join('');

    // Calculate Totals
    const totals = monthShifts.reduce((acc, shift) => ({
        total: acc.total + shift.hours.total,
        normal: acc.normal + shift.hours.normal,
        night: acc.night + shift.hours.night,
        holiday: acc.holiday + shift.hours.holiday
    }), { total: 0, normal: 0, night: 0, holiday: 0 });

    // Calculate Monthly Overtime
    const overtime = Math.max(0, totals.total - MONTHLY_HOURS_THRESHOLD);
    totals.overtime = overtime;

    updateMonthlyTotals(totals);
}

function updateMonthlyTotals(totals) {
    document.getElementById('total-hours').textContent = `${totals.total.toFixed(2)}h`;
    document.getElementById('total-night').textContent = `${totals.night.toFixed(2)}h`;
    document.getElementById('total-holiday').textContent = `${totals.holiday.toFixed(2)}h`;
    document.getElementById('total-overtime').textContent = `${totals.overtime.toFixed(2)}h`;
}

function saveShiftsToStorage() {
    localStorage.setItem('shifts', JSON.stringify(shifts));
}

function loadShiftsFromStorage() {
    try {
        const saved = localStorage.getItem('shifts');
        if (saved) shifts = JSON.parse(saved);
    } catch (e) {
        console.error(e);
        shifts = [];
    }
}

function generateId() {
    return `shift_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

window.editShift = openEditShiftModal;
window.deleteShift = (id) => {
    if (confirm('¿Borrar turno?')) {
        shifts = shifts.filter(s => s.id !== id);
        saveShiftsToStorage();
        renderShifts();
    }
};

// ============= HISTORY MODAL =============
function openHistoryModal() {
    renderHistoryList();
    document.getElementById('history-modal').classList.add('show');
}

function closeHistoryModal() {
    document.getElementById('history-modal').classList.remove('show');
}

function renderHistoryList() {
    const historyList = document.getElementById('history-list');

    // Get all unique months that have shifts
    const monthsWithShifts = getMonthsWithShifts();

    if (monthsWithShifts.length === 0) {
        historyList.innerHTML = `
            <div class="history-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                <p>No hay registros históricos</p>
            </div>
        `;
        return;
    }

    const monthNames = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    historyList.innerHTML = monthsWithShifts.map(({ month, year, count, totalHours }) => {
        const isCurrentMonth = month === currentMonth && year === currentYear;
        const monthLabel = `${monthNames[month]} ${year}`;

        return `
            <div class="history-item ${isCurrentMonth ? 'current' : ''}" 
                 onclick="navigateToMonth(${month}, ${year})">
                <div class="history-item-info">
                    <div class="history-item-month">
                        ${monthLabel} ${isCurrentMonth ? '(Actual)' : ''}
                    </div>
                    <div class="history-item-stats">
                        ${count} turno${count !== 1 ? 's' : ''} • ${totalHours.toFixed(2)}h totales
                    </div>
                </div>
                <div class="history-item-badge">${count}</div>
            </div>
        `;
    }).join('');
}

function getMonthsWithShifts() {
    const monthMap = new Map();

    shifts.forEach(shift => {
        const date = new Date(shift.date);
        const month = date.getMonth();
        const year = date.getFullYear();
        const key = `${year}-${month}`;

        if (!monthMap.has(key)) {
            monthMap.set(key, {
                month,
                year,
                count: 0,
                totalHours: 0
            });
        }

        const data = monthMap.get(key);
        data.count++;
        data.totalHours += shift.hours.total;
    });

    // Convert to array and sort by date (most recent first)
    return Array.from(monthMap.values())
        .sort((a, b) => {
            if (a.year !== b.year) return b.year - a.year;
            return b.month - a.month;
        });
}

function navigateToMonth(month, year) {
    currentMonth = month;
    currentYear = year;
    updateMonthDisplay();
    renderShifts();
    closeHistoryModal();
}

window.navigateToMonth = navigateToMonth;
