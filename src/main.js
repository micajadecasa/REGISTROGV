// ============= CONSTANTS =============
const SPANISH_HOLIDAYS_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQqv5n85zlFlRhK82ns2qvS-wQmaOpEyT7OmqxgEmOMS5kwmra-POIXomKKO-cfqSCy-MIJhWI7fnOS/pub?output=csv";

const NIGHT_START_HOUR = 22; // 22:00
const NIGHT_END_HOUR = 6;    // 06:00
const MONTHLY_HOURS_THRESHOLD = 162; // Standard monthly hours for security guards

const FALLBACK_HOLIDAYS = [
    '2024-01-01', '2024-01-06', '2024-03-28', '2024-03-29', '2024-05-01',
    '2024-08-15', '2024-10-12', '2024-11-01', '2024-12-06', '2024-12-08', '2024-12-25',
    '2025-01-01', '2025-01-06', '2025-04-17', '2025-04-18', '2025-05-01',
    '2025-08-15', '2025-10-12', '2025-11-01', '2025-12-06', '2025-12-08', '2025-12-25',
    '2026-01-01', '2026-01-06', '2026-04-02', '2026-04-03', '2026-05-01',
    '2026-08-15', '2026-10-12', '2026-11-01', '2026-12-06', '2026-12-08', '2026-12-25'
];

// ============= STATE MANAGEMENT =============
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let shifts = [];
let editingShiftId = null;
let holidays = []; // Will be populated from CSV
let monthlyObservations = {}; // Stores notes per "YYYY-M"

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
    loadObservationsFromStorage();
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
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const dateString = `${y}-${m}-${d}`;
        if (holidays.includes(dateString)) return true;
    } catch (e) {
        return false;
    }
    return false;
}

// ============= EVENT LISTENERS =============
function setupEventListeners() {
    // Theme toggles
    document.querySelectorAll('.theme-toggle').forEach(btn => {
        btn.addEventListener('click', toggleTheme);
    });

    // Month navigation
    document.getElementById('prev-month').addEventListener('click', () => navigateMonth(-1));
    document.getElementById('next-month').addEventListener('click', () => navigateMonth(1));

    // Add shift button
    document.getElementById('add-shift-btn').addEventListener('click', openAddShiftModal);

    // Shift Modal controls
    document.getElementById('close-modal').addEventListener('click', closeModal);
    document.getElementById('cancel-btn').addEventListener('click', closeModal);


    // Form submission
    document.getElementById('shift-form').addEventListener('submit', handleFormSubmit);

    // Export buttons
    document.getElementById('generate-pdf-btn').addEventListener('click', () => openExportModal('pdf'));

    // PDF/Excel Modal controls
    document.getElementById('close-pdf-modal').addEventListener('click', closePdfModal);
    document.getElementById('cancel-pdf-btn').addEventListener('click', closePdfModal);


    // Export Form submission
    document.getElementById('pdf-settings-form').addEventListener('submit', handleExportSubmission);

    // History button
    document.getElementById('history-btn').addEventListener('click', openHistoryModal);
    document.getElementById('close-history-modal').addEventListener('click', closeHistoryModal);


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

    // Payroll controls
    document.getElementById('generate-payroll-btn').addEventListener('click', openPayrollModal);
    document.getElementById('close-payroll-modal').addEventListener('click', closePayrollModal);
    document.getElementById('cancel-payroll-btn').addEventListener('click', closePayrollModal);

    document.getElementById('payroll-settings-form').addEventListener('submit', handlePayrollSubmit);

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab(e.target.dataset.tab);
        });
    });


    // Incident Management
    document.getElementById('add-incident-btn').addEventListener('click', () => {
        document.getElementById('new-incident-form').style.display = 'block';
        document.getElementById('add-incident-btn').style.display = 'none';

        // Default dates
        const now = new Date();
        const startOfMonth = new Date(currentYear, currentMonth, 1).toISOString().split('T')[0];
        const endOfMonth = new Date(currentYear, currentMonth + 1, 0).toISOString().split('T')[0];

        document.getElementById('incident-start').value = startOfMonth;
        document.getElementById('incident-end').value = endOfMonth;
    });

    document.getElementById('cancel-incident').addEventListener('click', () => {
        document.getElementById('new-incident-form').style.display = 'none';
        document.getElementById('add-incident-btn').style.display = 'block';
    });

    document.getElementById('save-incident').addEventListener('click', saveIncident);

    // Monthly Observations sync
    const obsTextarea = document.getElementById('monthly-observations');
    obsTextarea.addEventListener('input', (e) => {
        const key = `${currentYear}-${currentMonth}`;
        monthlyObservations[key] = e.target.value;
        saveObservationsToStorage();
    });
}

function switchTab(tabId) {
    // Buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn.dataset.tab === tabId) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    // Content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.id === `tab-${tabId}` ? content.classList.add('active') : content.classList.remove('active');
    });
}

// ============= INCIDENT MANAGEMENT =============
let payrollIncidents = [];

function loadIncidents() {
    const stored = localStorage.getItem('payrollIncidents');
    if (stored) {
        payrollIncidents = JSON.parse(stored);
    }
}

function saveIncidentsToStorage() {
    localStorage.setItem('payrollIncidents', JSON.stringify(payrollIncidents));
}

function getMonthIncidents(month, year) {
    return payrollIncidents.filter(inc => {
        const start = new Date(inc.start);
        const end = new Date(inc.end);

        // Check overlap with current month
        const monthStart = new Date(year, month, 1);
        const monthEnd = new Date(year, month + 1, 0);

        return start <= monthEnd && end >= monthStart;
    });
}

function renderIncidentsList() {
    const list = document.getElementById('incidents-list');
    const monthIncidents = getMonthIncidents(currentMonth, currentYear);

    if (monthIncidents.length === 0) {
        list.innerHTML = '<div class="empty-state-small">No hay incidencias registradas este mes.</div>';
        return;
    }

    list.innerHTML = monthIncidents.map(inc => `
        <div class="incident-item" style="border-bottom:1px solid #eee; padding: 5px 0; display:flex; justify-content:space-between; align-items:center;">
             <div>
                <strong>${getIncidentLabel(inc.type)}</strong><br>
                <small>${formatDate(inc.start)} - ${formatDate(inc.end)}</small>
             </div>
             <button type="button" class="close-btn" style="color:red;" onclick="deleteIncident('${inc.id}')">
                🗑️
             </button>
        </div>
    `).join('');
}

function getIncidentLabel(type) {
    const map = {
        'it_comun': 'Baja Enf. Común',
        'it_accidente': 'Baja Accidente',
        'vacaciones': 'Vacaciones',
        'ausencia': 'Ausencia No Just.'
    };
    return map[type] || type;
}

function formatDate(dateStr) {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}`;
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function saveIncident() {
    const type = document.getElementById('incident-type').value;
    const start = document.getElementById('incident-start').value;
    const end = document.getElementById('incident-end').value;

    if (!start || !end) {
        alert('Por favor selecciona fechas');
        return;
    }

    if (new Date(end) < new Date(start)) {
        alert('La fecha fin no puede ser anterior a la inicio');
        return;
    }

    payrollIncidents.push({
        id: generateId(),
        type,
        start,
        end
    });

    saveIncidentsToStorage();
    renderIncidentsList();

    // Reset form
    document.getElementById('new-incident-form').style.display = 'none';
    document.getElementById('add-incident-btn').style.display = 'block';
}

// Global scope for delete onclick
window.deleteIncident = function (id) {
    if (confirm('¿Eliminar incidencia?')) {
        payrollIncidents = payrollIncidents.filter(i => i.id !== id);
        saveIncidentsToStorage();
        renderIncidentsList();
    }
};

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

    // Update observations box for the selected month
    const key = `${currentYear}-${currentMonth}`;
    document.getElementById('monthly-observations').value = monthlyObservations[key] || '';
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

    // Hourly precision calculation already done in the loop above.
    // Nocturnidad and Festividad are paid per hour in the security convention.

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
        const [y, m, d] = shift.date.split('-').map(Number);
        const shiftMonth = m - 1;
        const shiftYear = y;
        return shiftMonth === currentMonth && shiftYear === currentYear;
    }).sort((a, b) => new Date(a.date) - new Date(b.date));
}

// ============= PAYROLL MODAL FUNCTIONS =============
function openPayrollModal() {
    const profile = JSON.parse(localStorage.getItem('payrollProfile') || '{}');

    loadIncidents(); // Load incidents from storage
    renderIncidentsList(); // Render for current month

    // Cargar datos guardados si existen
    if (profile.workerName) document.getElementById('payroll-worker-name').value = profile.workerName;
    if (profile.nif) document.getElementById('payroll-nif').value = profile.nif;
    if (profile.ssNumber) document.getElementById('payroll-ss').value = profile.ssNumber;
    if (profile.category) document.getElementById('payroll-category').value = profile.category;
    if (profile.cotizationGroup) document.getElementById('payroll-group').value = profile.cotizationGroup;
    if (profile.hiringDate) document.getElementById('payroll-hiring-date').value = profile.hiringDate;
    if (profile.baseSalary) document.getElementById('payroll-base-salary').value = profile.baseSalary;

    // Nuevos campos
    if (profile.familySituation) document.getElementById('payroll-family-situation').value = profile.familySituation;
    if (profile.children) document.getElementById('payroll-children').value = profile.children;
    if (profile.irpfPercentage) document.getElementById('payroll-irpf').value = profile.irpfPercentage;

    // Pluses (check for new profile structure)
    if (profile.complements) {
        document.getElementById('payroll-transport').value = profile.complements.transport || 0;
        document.getElementById('payroll-vestuario').value = profile.complements.vestuario || 0;
        document.getElementById('payroll-peligrosidad').value = profile.complements.peligrosidad || 0;
        document.getElementById('payroll-arma').value = profile.complements.arma || 0;
    }

    if (profile.prorrateo !== undefined) document.getElementById('payroll-prorrateo').checked = profile.prorrateo;


    // Comprobamos autenticación para la opción de nube
    const cloudOption = document.getElementById('payroll-cloud-save');
    if (window.authModule && window.authModule.currentUser() && !window.authModule.currentUser().isGuest) {
        cloudOption.style.display = 'flex';
    } else {
        cloudOption.style.display = 'none';
    }

    // Reset tab to first one
    switchTab('personal');

    document.getElementById('payroll-settings-modal').classList.add('show');
}

function closePayrollModal() {
    document.getElementById('payroll-settings-modal').classList.remove('show');
}

async function handlePayrollSubmit(e) {
    e.preventDefault();
    const formData = new FormData(e.target);

    // Obtener datos del formulario
    const payrollData = {
        company: window.payrollModule.config.company, // Usar predeterminada por ahora
        worker: {
            name: formData.get('workerName'),
            nif: formData.get('nif'),
            ssNumber: formData.get('ssNumber'),
            category: formData.get('category'),
            cotizationGroup: parseInt(formData.get('cotizationGroup')),
            hiringDate: formData.get('hiringDate'),
            baseSalary: parseFloat(formData.get('baseSalary')) || 1323.00,
            familySituation: formData.get('familySituation'),
            children: parseInt(formData.get('children')) || 0,
            irpfPercentage: parseFloat(formData.get('irpfPercentage')) || 2,
            prorrateo: formData.get('prorrateo') === 'on'
        },
        complements: {
            transport: parseFloat(formData.get('transport')) || 0,
            food: parseFloat(formData.get('food')) || 0, // Legacy field kept for compatibility
            vestuario: parseFloat(formData.get('vestuario')) || 0,
            peligrosidad: parseFloat(formData.get('peligrosidad')) || 0,
            arma: parseFloat(formData.get('arma')) || 0,
        },
        incidents: getMonthIncidents(currentMonth, currentYear) // Pass current month incidents
    };

    // Guardar perfil para futuro uso
    localStorage.setItem('payrollProfile', JSON.stringify({
        workerName: payrollData.worker.name,
        nif: payrollData.worker.nif,
        ssNumber: payrollData.worker.ssNumber,
        category: payrollData.worker.category,
        cotizationGroup: payrollData.worker.cotizationGroup,
        hiringDate: payrollData.worker.hiringDate,
        baseSalary: payrollData.worker.baseSalary,
        // Nuevos campos guardados
        familySituation: payrollData.worker.familySituation,
        children: payrollData.worker.children,
        irpfPercentage: payrollData.worker.irpfPercentage,
        prorrateo: payrollData.worker.prorrateo,
        complements: payrollData.complements
    }));

    // Configurar módulo de nómina
    window.payrollModule.config = { ...window.payrollModule.config, ...payrollData };

    // Calcular nómina
    const monthShifts = getMonthShifts();
    const calculatedPayroll = window.payrollModule.calculate(monthShifts, currentMonth, currentYear, payrollData.incidents); // Pass incidents

    // Generar PDF y obtener blob para guardar en la nube
    const pdfBlob = await window.payrollModule.generatePDF(calculatedPayroll);

    // Guardar en la nube si está activado
    const saveToCloud = formData.get('saveToCloud') === 'on';
    if (saveToCloud && window.authModule) {
        const monthNames = [
            'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
        ];
        const filename = `Nomina_${monthNames[currentMonth]}_${currentYear}.pdf`;
        const provider = window.authModule.authProvider();

        if (provider === 'google') {
            await window.authModule.saveToGoogleDrive(pdfBlob, filename);
        } else if (provider === 'microsoft') {
            await window.authModule.saveToOneDrive(pdfBlob, filename);
        }
    }

    closePayrollModal();
}

async function generatePDF(workerName, workerTip) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('portrait', 'mm', 'a4');

    const monthNames = [
        'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
        'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
    ];

    const monthShifts = getMonthShifts();

    // Calcular totales
    const totals = monthShifts.reduce((acc, shift) => ({
        total: acc.total + shift.hours.total,
        diurnas: acc.diurnas + shift.hours.normal,
        nocturnas: acc.nocturnas + shift.hours.night,
        festivas: acc.festivas + shift.hours.holiday
    }), { total: 0, diurnas: 0, nocturnas: 0, festivas: 0 });

    // Calcular desglose por servicios
    const serviceTotals = {};
    monthShifts.forEach(shift => {
        const service = shift.notes || 'Sin Servicio';
        if (!serviceTotals[service]) serviceTotals[service] = 0;
        serviceTotals[service] += shift.hours.total;
    });

    const servicesList = Object.entries(serviceTotals).map(([service, hours]) => ({
        service,
        hours: hours.toFixed(2)
    }));

    // Función para añadir header, footer y tabla en cada página
    function addPageContent(pageNum, totalPages) {
        // ========== HEADER ==========
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");

        // Nombre (izquierda)
        doc.text(`NOMBRE: ${workerName.toUpperCase()}`, 10, 15);

        // Mes y Año juntos (derecha)
        doc.text(`MES: ${monthNames[currentMonth]}     AÑO: ${currentYear}`, 120, 15);

        // Línea separadora
        doc.setLineWidth(0.5);
        doc.line(10, 18, 200, 18);

        // TIP (si existe)
        if (workerTip) {
            doc.setFontSize(9);
            doc.setFont("helvetica", "normal");
            doc.text(`TIP: ${workerTip}`, 10, 23);
        }

        // ========== FOOTER ==========
        const footerY = 285;

        // Línea superior del footer
        doc.setLineWidth(0.3);
        doc.line(10, footerY - 3, 200, footerY - 3);

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");

        // PC03 F04 (izquierda)
        doc.text('PC03 F04', 10, footerY);

        // Ed/Rev 1/0 (centro)
        doc.text('Ed/Rev 1/0', 105, footerY, { align: 'center' });

        // Paginación (derecha)
        doc.text(`Pág. ${pageNum}/${totalPages}`, 200, footerY, { align: 'right' });
    }

    // ========== PREPARAR DATOS DE LA TABLA ==========
    // Obtener todos los días del mes
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const dayNames = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

    const tableRows = [];

    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(currentYear, currentMonth, day);
        const dayOfWeek = dayNames[date.getDay()];

        // Buscar si hay turnos para este día
        const dayShifts = monthShifts.filter(s => {
            const [y, m, d] = s.date.split('-').map(Number);
            return d === day;
        });

        if (dayShifts.length > 0) {
            dayShifts.forEach((shift) => {
                tableRows.push([
                    dayOfWeek,
                    day.toString(),
                    shift.notes || '',
                    shift.startTime,
                    shift.endTime,
                    shift.hours.normal.toFixed(2),
                    shift.hours.night.toFixed(2),
                    shift.hours.holiday.toFixed(2),
                    '', // Columna 9 (Desglose servicios parte 1)
                    ''  // Columna 10 (Desglose servicios parte 2)
                ]);
            });
        } else {
            tableRows.push([
                dayOfWeek,
                day.toString(),
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                ''
            ]);
        }
    }

    // ========== LLENAR COLUMNA DE DESGLOSE DE SERVICIOS (DERECHA) ==========
    let currentRightRow = 0;
    const currentObs = monthlyObservations[`${currentYear}-${currentMonth}`] || '';

    // 1. Bloques de servicios dinámicos (2 rows per active service)
    const serviceLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
    servicesList.slice(0, 10).forEach((svc, idx) => {
        const label = serviceLetters[idx] || String.fromCharCode(65 + idx);

        // Header Row (Servicio X | Total h.)
        if (tableRows[currentRightRow]) {
            tableRows[currentRightRow][8] = `Servicio ${label}`;
            tableRows[currentRightRow][9] = `Total h.`;
            currentRightRow++;
        }

        // Data Row (Name | Hours)
        if (tableRows[currentRightRow]) {
            tableRows[currentRightRow][8] = svc.service;
            tableRows[currentRightRow][9] = svc.hours;
            currentRightRow++;
        }
    });

    // Pequeño espacio de separación si hay servicios
    if (servicesList.length > 0) currentRightRow++;

    // 2. Resumen Mensual (Sigue a los servicios)
    if (tableRows[currentRightRow]) {
        tableRows[currentRightRow][8] = 'Total horas';
        tableRows[currentRightRow][9] = totals.total.toFixed(2);
        currentRightRow++;
    }
    if (tableRows[currentRightRow]) {
        tableRows[currentRightRow][8] = 'Horas noches';
        tableRows[currentRightRow][9] = totals.nocturnas.toFixed(2);
        currentRightRow++;
    }
    if (tableRows[currentRightRow]) {
        tableRows[currentRightRow][8] = 'Horas festivos';
        tableRows[currentRightRow][9] = totals.festivas.toFixed(2);
        currentRightRow++;
    }

    // 3. Nota Obligatoria (Sigue al resumen)
    currentRightRow++; // Espacio
    const mandatoryStartRow = currentRightRow;
    if (tableRows[mandatoryStartRow]) {
        tableRows[mandatoryStartRow][8] = {
            content: 'Obligatoriamente, el cuadrante\ndeberá ser entregado antes\ndel día 2 de cada mes',
            rowSpan: 4,
            colSpan: 2,
            styles: { halign: 'center', valign: 'middle', fontSize: 7, cellPadding: 1 }
        };
        tableRows[mandatoryStartRow][9] = null;
        currentRightRow += 4;
    }

    // 4. Observaciones (Ocupa todo el resto del espacio disponible)
    currentRightRow++; // Espacio
    const observationsStartRow = currentRightRow;
    if (tableRows[observationsStartRow]) {
        tableRows[observationsStartRow][8] = {
            content: `Observaciones: ${currentObs}`,
            rowSpan: Math.max(2, tableRows.length - observationsStartRow),
            colSpan: 2,
            styles: { halign: 'left', valign: 'top', fontSize: 7.5 }
        };
        tableRows[observationsStartRow][9] = null;
    }

    // ========== GENERAR TABLA ==========
    const totalPages = 1; // Por ahora una sola página

    addPageContent(1, totalPages);

    doc.autoTable({
        startY: workerTip ? 30 : 27,
        head: [[
            { content: 'Día\nsem', rowSpan: 2 },
            { content: 'Día\nmes', rowSpan: 2 },
            { content: 'Servicio', rowSpan: 2 },
            { content: 'Horas servicio', colSpan: 2 },
            { content: 'Desglose horas', colSpan: 3 },
            { content: 'Desglose de servicios', rowSpan: 2, colSpan: 2 }
        ], [
            'H. entrada',
            'H. salida',
            'diurnas',
            'nocturn.',
            'festivas'
        ]],
        body: tableRows,
        theme: 'grid',
        styles: {
            fontSize: 8,
            cellPadding: 1,
            lineColor: [0, 0, 0],
            lineWidth: 0.1,
            halign: 'center',
            valign: 'middle'
        },
        headStyles: {
            fillColor: [200, 200, 200],
            textColor: [0, 0, 0],
            fontStyle: 'bold',
            fontSize: 8.5,
            halign: 'center',
            valign: 'middle'
        },
        columnStyles: {
            0: { cellWidth: 8 },  // Día sem
            1: { cellWidth: 8 },  // Día mes
            2: { cellWidth: 25 }, // Servicio
            3: { cellWidth: 15 }, // H. entrada
            4: { cellWidth: 15 }, // H. salida
            5: { cellWidth: 14 }, // diurnas
            6: { cellWidth: 14 }, // nocturnas
            7: { cellWidth: 14 }, // festivas
            8: { cellWidth: 45, halign: 'left', fontSize: 7.5 }, // Desglose serv 1
            9: { cellWidth: 29, halign: 'center', fontSize: 7.5 } // Desglose serv 2
        },
        didParseCell: function (data) {
            const cellText = (Array.isArray(data.cell.text) ? data.cell.text.join('') : String(data.cell.text));

            // Estilos para la columna de Desglose de Servicios (8 y 9)
            if (data.column.index === 8 || data.column.index === 9) {
                const summaryLabels = ['Total horas', 'Horas noches', 'Horas festivos'];
                const isSummaryLabel = summaryLabels.includes(cellText);
                const isServiceHeader = cellText.startsWith('Servicio ') || cellText === 'Total h.';

                if (isSummaryLabel || isServiceHeader) {
                    data.cell.styles.fillColor = [220, 220, 220];
                    data.cell.styles.fontStyle = 'normal';
                }

                // Negrita para los valores del resumen mensual (columna 9 cuando col 8 es una etiqueta de resumen)
                const rowData = data.row.raw;
                const labelInCol8 = rowData[8]?.content || rowData[8];
                if (data.column.index === 9 && summaryLabels.includes(String(labelInCol8))) {
                    data.cell.styles.fontStyle = 'bold';
                }
            }
        },
        margin: { top: 25, bottom: 20, left: 10, right: 10 },
        tableWidth: 'auto'
    });

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

function saveObservationsToStorage() {
    localStorage.setItem('monthlyObservations', JSON.stringify(monthlyObservations));
}

function loadObservationsFromStorage() {
    try {
        const saved = localStorage.getItem('monthlyObservations');
        if (saved) monthlyObservations = JSON.parse(saved);
    } catch (e) {
        monthlyObservations = {};
    }
}

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
        const [y, m, d] = shift.date.split('-').map(Number);
        const month = m - 1;
        const year = y;
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
