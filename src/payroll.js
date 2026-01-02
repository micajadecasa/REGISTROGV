// ============= PAYROLL MODULE =============
// Logic for Spanish Security Guard Payroll (Convenio Seguridad Privada)

window.payrollModule = (function () {

    // --- CONSTANTS (2024 Exact Values - Convention updated) ---
    const PAYROLL_CONSTANTS = {
        // Social Security Deductions (Worker Share)
        SS_CONTINGENCIAS_COMUNES: 4.70,
        SS_DESEMPLEO: 1.55,
        SS_FP: 0.10,
        SS_HORAS_EXTRA: 4.70,
        SS_HORAS_EXTRA_FUERZA_MAYOR: 2.00,

        // IRPF (Simplified Table 2024 for estimation)
        IRPF_RATES: [
            { limit: 12450, rate: 19 },
            { limit: 20200, rate: 24 },
            { limit: 35200, rate: 30 },
            { limit: 60000, rate: 37 },
            { limit: 300000, rate: 45 },
            { limit: Infinity, rate: 47 }
        ],

        // Basado en BOE 2024 - Resolución 5 abril 2024
        PLUS_TRANSPORTE: 129.90,
        PLUS_VESTUARIO: 107.97,
        PLUS_PELIGROSIDAD_MIN: 20.00, // Variable, but often exists

        // Plus Rates (Percentages over Base Salary hour)
        PLUS_NOCTURNIDAD: 1.15, // Aprox ~1.15€/h fixed usually
        PLUS_FESTIVO: 0.80,     // Valor hora festiva

        // Bases (2024)
        BASE_MINIMA: 1323.00, // SMI 2024 references
        BASE_MAXIMA: 4720.50,

        // IT Permissions (Percentages)
        IT_ENFERMEDAD_1_3: 0,
        IT_ENFERMEDAD_4_20: 60,
        IT_ENFERMEDAD_21_PLUS: 75,
        IT_ACCIDENTE: 75,

        // Trienios 2024 (Approx)
        TRIENIO_VALUE: 25.86
    };

    // --- CONFIGURATION ---
    let config = {
        company: {
            name: "EMPRESA DE SEGURIDAD S.L.",
            cif: "B-12345678",
            address: "C/ Segura 123, 01001 Vitoria-Gasteiz",
            ccc: "01/111222333/44"
        },
        worker: {
            name: "",
            nif: "",
            ssNumber: "",
            category: "Vigilante de Seguridad",
            cotizationGroup: 7, // Auxiliares/Subalternos
            hiringDate: null,
            baseSalary: 1200.00, // Salario Base Convenio 2024 (BOE REF)
            familySituation: 'single',
            children: 0,
            irpfPercentage: 2,
            prorrateo: true
        },
        complements: {
            transport: 129.90, // BOE 2024
            vestuario: 107.97, // BOE 2024
            peligrosidad: 20.00,
            arma: 0
        },
        incidents: [] // Array of incident objects
    };

    // --- HELPER FUNCTIONS ---

    function calculateTrienios(hiringDate) {
        if (!hiringDate) return 0;
        const start = new Date(hiringDate);
        const now = new Date();
        const years = (now - start) / (1000 * 60 * 60 * 24 * 365.25);
        if (years < 3) return 0;
        const numTrienios = Math.floor(years / 3);
        return numTrienios * PAYROLL_CONSTANTS.TRIENIO_VALUE;
    }

    function getDaysInMonth(month, year) {
        return new Date(year, month + 1, 0).getDate();
    }

    // --- CORE LOGIC: INCIDENTS (IT) CALCULATOR ---
    function calculateIT(incidents, month, year, baseReguladora = 1500) {
        // Calculate days lost to IT and amount to pay
        let itDays = 0;
        let itPay = 0;
        let itDetails = [];

        const daysInMonth = getDaysInMonth(month, year);
        const monthStart = new Date(year, month, 1);
        const monthEnd = new Date(year, month + 1, 0);

        incidents.forEach(inc => {
            if (inc.type.startsWith('it_')) {
                const start = new Date(inc.start);
                const end = new Date(inc.end);

                // Calculate overlap with current month
                const effectiveStart = start < monthStart ? monthStart : start;
                const effectiveEnd = end > monthEnd ? monthEnd : end;

                if (effectiveStart <= effectiveEnd) {
                    const days = Math.ceil((effectiveEnd - effectiveStart) / (1000 * 60 * 60 * 24)) + 1;
                    itDays += days;

                    // Calculate Pay based on duration from START of IT (not start of month)
                    // We need to loop day by day to apply correct percentage 
                    let current = new Date(effectiveStart);
                    let dailyBase = baseReguladora / 30; // Standard daily base

                    let amount = 0;

                    while (current <= effectiveEnd) {
                        const dayOfIT = Math.ceil((current - start) / (1000 * 60 * 60 * 24)) + 1;

                        let percent = 0;
                        if (inc.type === 'it_comun') {
                            if (dayOfIT <= 3) percent = PAYROLL_CONSTANTS.IT_ENFERMEDAD_1_3;
                            else if (dayOfIT <= 20) percent = PAYROLL_CONSTANTS.IT_ENFERMEDAD_4_20;
                            else percent = PAYROLL_CONSTANTS.IT_ENFERMEDAD_21_PLUS;
                        } else if (inc.type === 'it_accidente') {
                            percent = PAYROLL_CONSTANTS.IT_ACCIDENTE;
                        }

                        amount += dailyBase * (percent / 100);
                        current.setDate(current.getDate() + 1);
                    }

                    itPay += amount;
                    itDetails.push({
                        type: inc.type === 'it_comun' ? 'Enf. Común' : 'Accidente',
                        days: days,
                        amount: amount
                    });
                }
            }
        });

        return {
            days: itDays,
            amount: itPay,
            details: itDetails
        };
    }

    // --- MAIN CALCULATION ---
    function calculatePayroll(shifts, month, year, incidents = []) {
        // 1. Analyze Shifts (Hours)
        let totalHours = 0;
        let nightHours = 0;
        let holidayHours = 0;

        shifts.forEach(s => {
            totalHours += s.hours.total;
            nightHours += s.hours.night;
            holidayHours += s.hours.holiday;
        });

        // 2. Calculate IT Impact
        const itData = calculateIT(incidents, month, year); // Using default base reguladora for now
        const workedDays = 30 - itData.days; // Standard 30-day month for payroll
        const workedRatio = Math.max(0, workedDays / 30);

        // 3. BASE SALARY (Proportional to worked days)
        const baseSalary = config.worker.baseSalary * workedRatio;

        // 4. COMPLEMENTS
        const trieniosQty = calculateTrienios(config.worker.hiringDate);
        const antiguedad = trieniosQty * workedRatio;

        // Peligrosidad/Plus activity (proportional)
        const peligrosidad = (config.complements.peligrosidad || 0) * workedRatio;
        const plusArma = (config.complements.arma || 0) * workedRatio;

        // Transporte/Vestuario (proportional to worked days in many conventions, or fixed)
        // We will make them proportional to be safe for IT
        const transporte = (config.complements.transport || 0) * workedRatio;
        const vestuario = (config.complements.vestuario || 0) * workedRatio;

        // 5. VARIABLE CONCEPTS (Hours)
        // Approx values: Night ~1.15€/h, Holiday ~0.80€/h (on top of salary)
        const totalNocturnidad = nightHours * PAYROLL_CONSTANTS.PLUS_NOCTURNIDAD;
        const totalFestividad = holidayHours * PAYROLL_CONSTANTS.PLUS_FESTIVO;

        // Overtime: > 162 hours
        const overtimeHours = Math.max(0, totalHours - 162);
        const overtimeRate = 12.00; // Est.
        const totalExtras = overtimeHours * overtimeRate;

        // 6. TOTAL DEVENGADO (GROSS)
        // Paga Extra Prorrateada?
        let pagaExtra = 0;
        if (config.worker.prorrateo) {
            // Let's use simplified (Base + Ant) * 2 / 12
            pagaExtra = ((config.worker.baseSalary + trieniosQty) * 2) / 12 * workedRatio;
        }

        const totalDevengado = baseSalary + antiguedad + peligrosidad + plusArma +
            transporte + vestuario +
            totalNocturnidad + totalFestividad + totalExtras +
            itData.amount + pagaExtra;

        // 7. BASES DE COTIZACIÓN
        // Prorrateo included in base calculation always
        const prorrataPagas = ((config.worker.baseSalary + trieniosQty + (config.complements.peligrosidad || 0)) * 2) / 12;

        let baseCC = totalDevengado - totalExtras - transporte - vestuario;
        // If prorrateo is disabled in payment, we must add it to the base
        if (!config.worker.prorrateo) baseCC += prorrataPagas;

        // Cap bases
        if (baseCC < PAYROLL_CONSTANTS.BASE_MINIMA) baseCC = PAYROLL_CONSTANTS.BASE_MINIMA;
        if (baseCC > PAYROLL_CONSTANTS.BASE_MAXIMA) baseCC = PAYROLL_CONSTANTS.BASE_MAXIMA;

        let baseCP = baseCC + totalExtras; // Contingencias Profesionales adds Overtime
        if (baseCP > PAYROLL_CONSTANTS.BASE_MAXIMA) baseCP = PAYROLL_CONSTANTS.BASE_MAXIMA;

        // 8. DEDUCTIONS
        const dedCC = baseCC * (PAYROLL_CONSTANTS.SS_CONTINGENCIAS_COMUNES / 100);
        const dedDesempleo = baseCP * (PAYROLL_CONSTANTS.SS_DESEMPLEO / 100);
        const dedFP = baseCP * (PAYROLL_CONSTANTS.SS_FP / 100);
        const dedExtras = totalExtras * (PAYROLL_CONSTANTS.SS_HORAS_EXTRA / 100);

        const totalSS = dedCC + dedDesempleo + dedFP + dedExtras;

        // IRPF Base = Total Devengado (usually) - Exempt items (Indemnizaciones) - IT sometimes?
        // Simplified: Base IRPF = Total Devengado
        const baseIRPF = totalDevengado;
        const irpfRate = config.worker.irpfPercentage || 2.0;
        const dedIRPF = baseIRPF * (irpfRate / 100);

        const totalDeducciones = totalSS + dedIRPF;
        const liquido = totalDevengado - totalDeducciones;

        return {
            details: {
                diasTrabajados: workedDays,
                baseSalary,
                antiguedad,
                incidencias: itData,
                pluses: {
                    peligrosidad,
                    transporte,
                    vestuario,
                    arma: plusArma,
                    nocturnidad: totalNocturnidad,
                    festividad: totalFestividad,
                    extras: totalExtras
                },
                pagasExtras: pagaExtra
            },
            bases: {
                cc: baseCC,
                cp: baseCP,
                irpf: baseIRPF
            },
            deductions: {
                cc: dedCC,
                desempleo: dedDesempleo,
                fp: dedFP,
                extras: dedExtras,
                irpf: dedIRPF
            },
            totals: {
                gross: totalDevengado,
                deductions: totalDeducciones,
                net: liquido
            },
            meta: {
                month,
                year,
                totalHours
            }
        };
    }

    // --- PDF GENERATION ---
    async function generatePayrollPDF(data) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('portrait', 'mm', 'a4');
        const MARGIN = 15;
        let y = MARGIN;

        // Fonts
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text("NÓMINA INDIVIDUAL", 105, y, { align: 'center' });
        y += 10;

        // --- COMPANY & WORKER HEADER ---
        doc.setFontSize(10);
        doc.setLineWidth(0.2);

        // Box for Company
        doc.rect(MARGIN, y, 85, 30);
        doc.text(config.company.name, MARGIN + 2, y + 5);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(`CIF: ${config.company.cif}`, MARGIN + 2, y + 10);
        doc.text(`Dir: ${config.company.address}`, MARGIN + 2, y + 15);
        doc.text(`CCC: ${config.company.ccc}`, MARGIN + 2, y + 20);

        // Box for Worker
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.rect(110, y, 85, 30);
        doc.text("TRABAJADOR/A", 112, y + 5);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(`Nombre: ${config.worker.name || '---'}`, 112, y + 12);
        doc.text(`NIF: ${config.worker.nif || '---'}`, 112, y + 17);
        doc.text(`NSS: ${config.worker.ssNumber || '---'}`, 112, y + 22);
        doc.text(`Categ.: ${config.worker.category}`, 112, y + 27);

        y += 35;

        // --- PERIOD INFO ---
        doc.setFillColor(240, 240, 240);
        doc.rect(MARGIN, y, 180, 8, 'F');
        doc.setFont('helvetica', 'bold');
        doc.text(`Periodo de Liquidación: ${getMonthName(data.meta.month)} ${data.meta.year}`, MARGIN + 2, y + 5);
        doc.text(`Total Días: 30`, 160, y + 5);

        y += 12;

        // --- BODY TABLE ---
        const startY = y;

        // Headers
        doc.setFillColor(220, 220, 220);
        doc.rect(MARGIN, y, 180, 7, 'F');
        doc.text("CONCEPTOS", MARGIN + 2, y + 5);
        doc.text("UNIDADES", 100, y + 5);
        doc.text("DEVENGOS", 130, y + 5);
        doc.text("DEDUCC.", 170, y + 5);
        y += 8;

        doc.setFont('helvetica', 'normal');

        // Rows renderer
        function addRow(concept, units, earnings, deductions, isBold = false) {
            if (isBold) doc.setFont('helvetica', 'bold');
            else doc.setFont('helvetica', 'normal');

            doc.text(concept, MARGIN + 2, y);
            if (units) doc.text(String(units), 105, y, { align: 'center' });
            if (earnings !== null) doc.text(formatMoney(earnings), 150, y, { align: 'right' });
            if (deductions !== null) doc.text(formatMoney(deductions), 190, y, { align: 'right' });

            y += 5;
        }

        // 1. PERCEPCIONES SALARIALES
        doc.setFont('helvetica', 'bold');
        doc.text("I. PERCEPCIONES SALARIALES", MARGIN, y);
        y += 5;

        addRow("Salario Base", 30, data.details.baseSalary, null);
        if (data.details.antiguedad > 0) addRow("Antigüedad", null, data.details.antiguedad, null);
        if (data.details.pluses.peligrosidad > 0) addRow("Plus Peligrosidad", null, data.details.pluses.peligrosidad, null);
        if (data.details.pluses.arma > 0) addRow("Plus Arma", null, data.details.pluses.arma, null);

        // Horas
        if (data.details.pluses.nocturnidad > 0) addRow("Plus Nocturnidad", `${Math.round(data.details.pluses.nocturnidad / 1.15)}h`, data.details.pluses.nocturnidad, null);
        if (data.details.pluses.festividad > 0) addRow("Plus Festividad", null, data.details.pluses.festividad, null);
        if (data.details.pluses.extras > 0) addRow("Horas Extraordinarias", null, data.details.pluses.extras, null);

        // Pagas Extra
        if (config.worker.prorrateo) {
            addRow("Paga Extra Prorrateada", null, data.details.pagasExtras, null);
        }

        y += 2;

        // 2. PERCEPCIONES NO SALARIALES
        doc.setFont('helvetica', 'bold');
        doc.text("II. PERCEPCIONES NO SALARIALES", MARGIN, y);
        y += 5;

        if (data.details.pluses.transporte > 0) addRow("Plus Transporte", null, data.details.pluses.transporte, null);
        if (data.details.pluses.vestuario > 0) addRow("Plus Vestuario", null, data.details.pluses.vestuario, null);

        // IT Benefits
        if (data.details.incidencias.amount > 0) {
            data.details.incidencias.details.forEach(it => {
                addRow(`Prestación IT (${it.type})`, `${it.days} días`, it.amount, null);
            });
        }

        y += 2;

        // 3. DEDUCCIONES
        doc.setFont('helvetica', 'bold');
        doc.text("III. DEDUCCIONES", MARGIN, y);
        y += 5;

        addRow("Contingencias Comunes (4.70%)", null, null, data.deductions.cc);
        addRow("Desempleo (1.55%)", null, null, data.deductions.desempleo);
        addRow("Formación Profesional (0.10%)", null, null, data.deductions.fp);
        if (data.deductions.extras > 0) addRow("Horas Extra (4.70%)", null, null, data.deductions.extras);
        addRow(`IRPF (${config.worker.irpfPercentage}%)`, null, null, data.deductions.irpf);

        // --- TOTALS SECTION ---
        y = 220;
        doc.setLineWidth(0.5);
        doc.line(MARGIN, y, 195, y);
        y += 5;

        doc.setFont('helvetica', 'bold');
        doc.text("TOTAL DEVENGADO", 110, y);
        doc.text(formatMoney(data.totals.gross), 150, y, { align: 'right' });

        doc.text("TOTAL A DEDUCIR", 160, y);
        doc.text(formatMoney(data.totals.deductions), 190, y, { align: 'right' });

        y += 10;

        // LIQUIDO
        doc.setFillColor(230, 240, 255);
        doc.rect(130, y - 5, 65, 12, 'F');
        doc.setFontSize(12);
        doc.text("LÍQUIDO A PERCIBIR", 135, y + 2);
        doc.setFontSize(14);
        doc.text(formatMoney(data.totals.net), 190, y + 2, { align: 'right' });

        // --- BASES FOOTER ---
        y = 250;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');

        const col1 = MARGIN;
        const col2 = MARGIN + 60;
        const col3 = MARGIN + 120;

        doc.text("DETERMINACIÓN BASES DE COTIZACIÓN:", col1, y);
        y += 5;
        doc.text(`Remuneración Mensual: ${formatMoney(data.bases.cc - (config.worker.prorrateo ? 0 : data.details.pagasExtras))}`, col1, y);
        doc.text(`Prorrata Pagas Extra: ${formatMoney(config.worker.prorrateo ? data.details.pagasExtras : (data.bases.cc / 12) * 2)}`, col1, y + 4); // Aprox view
        doc.setFont('helvetica', 'bold');
        doc.text(`BASE C. COMUNES: ${formatMoney(data.bases.cc)}`, col1, y + 9);

        doc.setFont('helvetica', 'normal');
        doc.text(`BASE C. PROFESIONALES: ${formatMoney(data.bases.cp)}`, col2, y + 9);
        doc.text(`BASE I.R.P.F.: ${formatMoney(data.bases.irpf)}`, col3, y + 9);

        // Save
        const filename = `Nomina_${getMonthName(data.meta.month)}_${data.meta.year}.pdf`;
        doc.save(filename);

        return doc.output('blob'); // Return blob for cloud save
    }

    function formatMoney(amount) {
        return amount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
    }

    function getMonthName(monthIndex) {
        const names = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        return names[monthIndex];
    }

    return {
        config,
        calculate: calculatePayroll,
        generatePDF: generatePayrollPDF
    };

})();
