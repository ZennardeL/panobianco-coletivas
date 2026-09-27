/**
 * Panobianco Coletivas — Aplicação Principal (Controlador & Renderizador)
 */
import { CONFIG } from './config.js';
import * as api from './api.js';

// ──────────────────────────────────────────────
// Estado da Aplicação
// ──────────────────────────────────────────────
const state = {
    currentUser: null,       // { role: 'TEACHER' | 'ADMIN', teacher?: object, name: string }
    teachers: [],
    schedules: [],
    currentMonth: getCurrentYearMonth(), // 'YYYY-MM'
    teacherCheckins: [],     // Check-ins do professor logado no mês
    adminSummary: null,      // Relatório consolidado do mês
    adminCheckins: [],       // Todos os check-ins do mês
    selectedTeacherModal: null
};

// Dias da semana em PT-BR
const DAYS_OF_WEEK = [
    { id: 1, name: 'Segunda-feira', short: 'SEG' },
    { id: 2, name: 'Terça-feira', short: 'TER' },
    { id: 3, name: 'Quarta-feira', short: 'QUA' },
    { id: 4, name: 'Quinta-feira', short: 'QUI' },
    { id: 5, name: 'Sexta-feira', short: 'SEX' },
    { id: 6, name: 'Sábado', short: 'SÁB' },
    { id: 0, name: 'Domingo', short: 'DOM' }
];

function getCurrentYearMonth() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

function formatCurrency(val) {
    return (Number(val) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDateBr(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
}

function getMonthName(yearMonthStr) {
    const [y, m] = yearMonthStr.split('-');
    const months = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    return `${months[Number(m) - 1]} de ${y}`;
}

// ──────────────────────────────────────────────
// Inicialização do App
// ──────────────────────────────────────────────

async function init() {
    try {
        api.initSupabase();
    } catch (e) {
        console.error('Erro ao conectar ao Supabase:', e);
        showToast('⚠️ Erro ao conectar ao banco de dados.', 'danger');
        return;
    }

    // Carregar sessão salva
    const saved = localStorage.getItem('panobianco_coletivas_session');
    if (saved) {
        try {
            state.currentUser = JSON.parse(saved);
        } catch {
            localStorage.removeItem('panobianco_coletivas_session');
        }
    }

    // Carregar dados básicos (professores e grade)
    try {
        const [teachers, schedules] = await Promise.all([
            api.getTeachers(),
            api.getSchedules()
        ]);
        state.teachers = teachers;
        state.schedules = schedules;
    } catch (err) {
        console.warn('Erro ao carregar dados iniciais:', err);
    }

    renderApp();
}

// ──────────────────────────────────────────────
// Controle de Sessão e Autenticação
// ──────────────────────────────────────────────

async function loginTeacher(code, pin) {
    const cleanCode = (code || '').trim().toLowerCase();
    if (!cleanCode) {
        showToast('Digite seu código de acesso ou selecione seu nome.', 'warning');
        return;
    }

    try {
        // Verificar se é senha mestre de Admin
        if (cleanCode === 'admin' || cleanCode === 'f20729' || cleanCode === 'f20094' || cleanCode === 'f20095' || cleanCode === 'f20735') {
            state.currentUser = {
                role: 'ADMIN',
                name: cleanCode === 'admin' ? 'Gestão Panobianco' : `Gestor [${cleanCode.toUpperCase()}]`
            };
            localStorage.setItem('panobianco_coletivas_session', JSON.stringify(state.currentUser));
            showToast('✅ Bem-vindo, Gestor!', 'success');
            renderApp();
            return;
        }

        const teacher = await api.getTeacherByCode(cleanCode, pin);
        if (!teacher) {
            showToast('❌ Professor não encontrado. Verifique seu código.', 'danger');
            return;
        }

        state.currentUser = {
            role: 'TEACHER',
            teacher: teacher,
            name: teacher.short_name || teacher.name
        };
        localStorage.setItem('panobianco_coletivas_session', JSON.stringify(state.currentUser));
        showToast(`✅ Olá, ${teacher.short_name}!`, 'success');
        renderApp();
    } catch (err) {
        showToast(`❌ ${err.message || 'Erro ao realizar login.'}`, 'danger');
    }
}

function logout() {
    state.currentUser = null;
    localStorage.removeItem('panobianco_coletivas_session');
    renderApp();
    showToast('Sessão encerrada com sucesso.', 'info');
}

// ──────────────────────────────────────────────
// Renderizador Principal (Roteamento Visual)
// ──────────────────────────────────────────────

function renderApp() {
    const container = document.getElementById('app-root');
    if (!container) return;

    if (!state.currentUser) {
        renderLoginView(container);
        return;
    }

    if (state.currentUser.role === 'TEACHER') {
        renderTeacherDashboard(container);
    } else {
        renderAdminDashboard(container);
    }
}

// ──────────────────────────────────────────────
// Tela 1: Login
// ──────────────────────────────────────────────

function renderLoginView(container) {
    container.innerHTML = `
        <div class="login-container">
            <div class="login-card">
                <div class="login-header">
                    <div class="brand-badge">PANOBIANCO COLETIVAS</div>
                    <h1>Check-in de Aulas</h1>
                    <p>Controle de presença e fechamento mensal da grade de ginástica</p>
                </div>

                <div class="login-tabs">
                    <button class="tab-btn active" id="tab-login-prof" onclick="app.switchLoginMode('prof')">
                        🏋️ Sou Professor
                    </button>
                    <button class="tab-btn" id="tab-login-admin" onclick="app.switchLoginMode('admin')">
                        💼 Gestor / RH
                    </button>
                </div>

                <!-- Formulário Professor -->
                <div id="form-login-prof" class="login-form-body">
                    <div class="form-group">
                        <label>SELECIONE SEU NOME OU DIGITE SEU CÓDIGO:</label>
                        <select id="login-teacher-select" class="form-control" onchange="app.onSelectTeacherLogin(this.value)">
                            <option value="">-- Escolha seu nome --</option>
                            ${state.teachers.map(t => `
                                <option value="${t.access_code}">${t.short_name} (${t.name})</option>
                            `).join('')}
                        </select>
                    </div>

                    <div class="form-group" style="margin-top: 12px;">
                        <input type="text" id="login-teacher-code" class="form-control" placeholder="Ou digite seu código (ex: karina, teco, fernanda...)" autocomplete="off">
                    </div>

                    <div class="form-group" style="margin-top: 12px;">
                        <label>PIN DE ACESSO (PADRÃO: 1234):</label>
                        <input type="password" id="login-teacher-pin" class="form-control" placeholder="****" value="1234" maxlength="6">
                    </div>

                    <button class="btn btn-primary btn-block" style="margin-top: 20px;" onclick="app.submitTeacherLogin()">
                        🚀 Entrar no Meu Painel
                    </button>
                </div>

                <!-- Formulário Gestor -->
                <div id="form-login-admin" class="login-form-body" style="display: none;">
                    <div class="form-group">
                        <label>CÓDIGO DE GESTOR / ADMIN:</label>
                        <input type="text" id="login-admin-code" class="form-control" placeholder="Código (ex: admin, f20729)" autocomplete="off">
                    </div>

                    <button class="btn btn-primary btn-block" style="margin-top: 20px;" onclick="app.submitAdminLogin()">
                        🔒 Acessar Painel do Gestor
                    </button>
                </div>

                <div class="login-footer">
                    <small>Unidade Boituva • Panobianco Academia</small>
                </div>
            </div>
        </div>
    `;
}

// ──────────────────────────────────────────────
// Tela 2: Visão do Professor (Mobile-First)
// ──────────────────────────────────────────────

async function renderTeacherDashboard(container) {
    const teacher = state.currentUser.teacher;
    container.innerHTML = `
        <div class="mobile-layout">
            <header class="app-header">
                <div class="header-left">
                    <span class="brand-tag">PANOBIANCO</span>
                    <h2>Olá, ${teacher.short_name}! 👋</h2>
                    <p class="header-subtitle">${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                </div>
                <div class="header-right">
                    <button class="btn-logout" onclick="app.logout()" title="Sair da conta">
                        🚪 Sair
                    </button>
                </div>
            </header>

            <main class="mobile-main">
                <!-- Seção 1: Check-in de Hoje -->
                <section class="section-card today-checkin-card">
                    <div class="card-header">
                        <h3>📍 Aulas de Hoje</h3>
                        <span class="live-dot" title="Sincronizado"></span>
                    </div>

                    <div id="teacher-today-classes" class="classes-list">
                        <div class="loading-spinner">Carregando suas aulas de hoje...</div>
                    </div>

                    <div style="margin-top: 14px; text-align: center;">
                        <button class="btn btn-outline btn-block" onclick="app.openSubstitutionModal()">
                            🔄 Cobri uma aula hoje (Substituição)
                        </button>
                    </div>
                </section>

                <!-- Seção 2: Resumo do Mês (PRIVACIDADE TOTAL - SEM R$) -->
                <section class="section-card monthly-stats-card">
                    <div class="month-selector-row">
                        <h3>Minhas Aulas em</h3>
                        <input type="month" id="teacher-month-select" class="month-input" value="${state.currentMonth}" onchange="app.onTeacherMonthChange(this.value)">
                    </div>

                    <div class="stats-badge-container">
                        <div class="stat-number" id="teacher-total-classes-badge">--</div>
                        <div class="stat-label">Aulas Ministradas</div>
                    </div>

                    <div class="privacy-note">
                        🔒 Os valores em R$ constam no fechamento financeiro do seu holerite/recibo via RH.
                    </div>
                </section>

                <!-- Seção 3: Histórico de Presenças do Mês -->
                <section class="section-card history-card">
                    <h3>📜 Histórico de Presenças</h3>
                    <div id="teacher-checkin-history" class="history-list">
                        <div class="loading-spinner">Carregando histórico...</div>
                    </div>
                </section>
            </main>
        </div>
    `;

    // Carregar dados dinâmicos do professor
    await loadTeacherData();
}

async function loadTeacherData() {
    const teacher = state.currentUser.teacher;
    const today = new Date();
    const todayDayOfWeek = today.getDay(); // 0 a 6
    const todayDateStr = today.toISOString().split('T')[0]; // 'YYYY-MM-DD'

    try {
        // Buscar check-ins do mês selecionado
        const checkins = await api.getCheckins(state.currentMonth, teacher.id);
        state.teacherCheckins = checkins;

        // Atualizar contador do mês (SEM R$)
        const badgeEl = document.getElementById('teacher-total-classes-badge');
        if (badgeEl) {
            badgeEl.innerText = `${checkins.length}`;
        }

        // Aulas de hoje na grade oficial do professor
        const todaySchedules = state.schedules.filter(s => 
            s.day_of_week === todayDayOfWeek && s.default_teacher_id === teacher.id
        );

        // Check-ins já realizados hoje
        const todayDoneCheckins = checkins.filter(c => c.class_date === todayDateStr);

        renderTodayClassesList(todaySchedules, todayDoneCheckins, todayDateStr);
        renderTeacherHistoryList(checkins);

    } catch (err) {
        console.error('Erro ao carregar dados do professor:', err);
        showToast('Erro ao atualizar dados.', 'danger');
    }
}

function renderTodayClassesList(schedules, doneCheckins, todayDateStr) {
    const container = document.getElementById('teacher-today-classes');
    if (!container) return;

    if (schedules.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>Nenhuma aula oficial programada na sua grade para hoje (${new Date().toLocaleDateString('pt-BR', { weekday: 'long' })}).</p>
                <small>Se você for cobrir a aula de outro professor, clique no botão de substituição abaixo.</small>
            </div>
        `;
        return;
    }

    container.innerHTML = schedules.map(sched => {
        // Verificar se já deu check-in nesta aula hoje
        const isDone = doneCheckins.find(c => 
            c.class_time === sched.start_time && c.modality === sched.modality
        );

        return `
            <div class="class-item ${isDone ? 'done' : 'pending'}">
                <div class="class-time">${sched.start_time}</div>
                <div class="class-details">
                    <span class="class-modality">${sched.modality}</span>
                    <span class="class-role">Aula Titular</span>
                </div>
                <div class="class-action">
                    ${isDone ? `
                        <span class="badge-done">✅ Presença Confirmada</span>
                    ` : `
                        <button class="btn btn-checkin" onclick="app.doCheckin('${sched.id}', '${sched.start_time}', '${sched.modality}', false)">
                            📍 Dar Check-in
                        </button>
                    `}
                </div>
            </div>
        `;
    }).join('');
}

function renderTeacherHistoryList(checkins) {
    const container = document.getElementById('teacher-checkin-history');
    if (!container) return;

    if (checkins.length === 0) {
        container.innerHTML = `<div class="empty-state"><p>Nenhuma aula registrada neste mês ainda.</p></div>`;
        return;
    }

    container.innerHTML = checkins.map(c => `
        <div class="history-item">
            <div class="history-date">
                <strong>${formatDateBr(c.class_date)}</strong>
                <span>${c.class_time}</span>
            </div>
            <div class="history-info">
                <strong>${c.modality}</strong>
                ${c.is_substitution ? `
                    <span class="badge-subst">Substituição (${c.original_teacher?.short_name || 'Colega'})</span>
                ` : `
                    <span class="badge-regular">Aula Regular</span>
                `}
                ${c.notes ? `<p class="history-notes">${c.notes}</p>` : ''}
            </div>
            <div class="history-status">
                <span class="status-confirmed">Confirmada</span>
            </div>
        </div>
    `).join('');
}

// ──────────────────────────────────────────────
// Ações do Professor
// ──────────────────────────────────────────────

async function doCheckin(scheduleId, classTime, modality, isSubstitution, originalTeacherId = null, notes = '') {
    const teacher = state.currentUser.teacher;
    const today = new Date().toISOString().split('T')[0];

    try {
        await api.createCheckin({
            teacherId: teacher.id,
            scheduleId: scheduleId || null,
            classDate: today,
            classTime: classTime,
            modality: modality,
            isSubstitution: isSubstitution,
            originalTeacherId: originalTeacherId,
            notes: notes
        });

        showToast(`🎉 Check-in confirmado para ${modality} às ${classTime}!`, 'success');
        await loadTeacherData();
    } catch (err) {
        console.error('Erro ao realizar checkin:', err);
        showToast(`❌ Falha no check-in: ${err.message}`, 'danger');
    }
}

// ──────────────────────────────────────────────
// Tela 3: Painel do Gestor / RH
// ──────────────────────────────────────────────

let currentAdminTab = 'fechamento'; // 'fechamento', 'grade', 'professores', 'registros'

async function renderAdminDashboard(container) {
    container.innerHTML = `
        <div class="admin-layout">
            <header class="admin-header">
                <div class="header-left">
                    <span class="brand-tag">PANOBIANCO ACADEMIA</span>
                    <h2>Painel do Gestor • Coletivas</h2>
                    <p class="header-subtitle">Boituva • Controle de Presenças e Folha</p>
                </div>
                <div class="header-right">
                    <span class="admin-badge">Gestor Conectado</span>
                    <button class="btn-logout" onclick="app.logout()">🚪 Sair</button>
                </div>
            </header>

            <!-- Abas do Gestor -->
            <nav class="admin-tabs">
                <button class="tab-btn ${currentAdminTab === 'fechamento' ? 'active' : ''}" onclick="app.switchAdminTab('fechamento')">
                    📊 Fechamento do Mês
                </button>
                <button class="tab-btn ${currentAdminTab === 'grade' ? 'active' : ''}" onclick="app.switchAdminTab('grade')">
                    📅 Grade Semanal
                </button>
                <button class="tab-btn ${currentAdminTab === 'professores' ? 'active' : ''}" onclick="app.switchAdminTab('professores')">
                    👥 Professores & Valores
                </button>
                <button class="tab-btn ${currentAdminTab === 'registros' ? 'active' : ''}" onclick="app.switchAdminTab('registros')">
                    📜 Todos os Check-ins
                </button>
            </nav>

            <main class="admin-main" id="admin-view-content">
                <div class="loading-spinner">Carregando painel do gestor...</div>
            </main>
        </div>
    `;

    await loadAdminTabData();
}

async function loadAdminTabData() {
    const container = document.getElementById('admin-view-content');
    if (!container) return;

    if (currentAdminTab === 'fechamento') {
        await renderFechamentoTab(container);
    } else if (currentAdminTab === 'grade') {
        renderGradeTab(container);
    } else if (currentAdminTab === 'professores') {
        renderProfessoresTab(container);
    } else if (currentAdminTab === 'registros') {
        await renderRegistrosTab(container);
    }
}

// ── Aba: Fechamento do Mês (Tabela Idêntica à Planilha) ──────────────

async function renderFechamentoTab(container) {
    container.innerHTML = `<div class="loading-spinner">Calculando fechamento do mês ${state.currentMonth}...</div>`;

    try {
        const summaryData = await api.getMonthClosureSummary(state.currentMonth);
        state.adminSummary = summaryData;

        container.innerHTML = `
            <div class="fechamento-container">
                <!-- Barra de Controle do Mês e Ações -->
                <div class="fechamento-toolbar">
                    <div class="toolbar-left">
                        <label>MÊS DE REFERÊNCIA:</label>
                        <input type="month" id="admin-month-input" class="month-input" value="${state.currentMonth}" onchange="app.onAdminMonthChange(this.value)">
                        <span class="month-title">${getMonthName(state.currentMonth)}</span>
                    </div>
                    <div class="toolbar-actions">
                        <button class="btn btn-outline" onclick="app.exportClosureCSV()">
                            📥 Baixar Excel / CSV
                        </button>
                        <button class="btn btn-outline" onclick="app.printClosureReport()">
                            🖨️ Imprimir Relatório
                        </button>
                        <button class="btn btn-whatsapp" onclick="app.copyWhatsappSummary()">
                            💬 Copiar p/ WhatsApp
                        </button>
                    </div>
                </div>

                <!-- Cards de Resumo Consolidado -->
                <div class="metric-cards-grid">
                    <div class="m-card">
                        <div class="m-title">TOTAL DE AULAS</div>
                        <div class="m-value">${summaryData.totals.totalClasses} <small>aulas</small></div>
                        <div class="m-sub">Ministradas no mês</div>
                    </div>
                    <div class="m-card">
                        <div class="m-title">TOTAL EM HOLERITE</div>
                        <div class="m-value text-blue">${formatCurrency(summaryData.totals.totalHolerite)}</div>
                        <div class="m-sub">CLT / Folha de Pagamento</div>
                    </div>
                    <div class="m-card">
                        <div class="m-title">TOTAL EM RECIBO</div>
                        <div class="m-value text-green">${formatCurrency(summaryData.totals.totalRecibo)}</div>
                        <div class="m-sub">RPA / Autônomo / Recibo</div>
                    </div>
                    <div class="m-card highlight">
                        <div class="m-title">VALOR TOTAL GERAL</div>
                        <div class="m-value text-orange">${formatCurrency(summaryData.totals.totalGeneral)}</div>
                        <div class="m-sub">Fechamento consolidado</div>
                    </div>
                </div>

                <!-- Tabela Consolidada idêntica à do Excel -->
                <div class="table-card" style="margin-top: 20px;">
                    <div class="table-header">
                        <h3>📋 Tabela de Acerto Salarial • ${getMonthName(state.currentMonth)}</h3>
                        <small>Conferência de aulas e valores de acordo com a planilha oficial</small>
                    </div>
                    <div class="table-responsive">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Nome do Professor</th>
                                    <th class="text-center">Quant. Aulas</th>
                                    <th class="text-right">Valor / Aula</th>
                                    <th class="text-right">Valor Total</th>
                                    <th class="text-center">Forma de Pagamento</th>
                                    <th class="text-right">Detalhes</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${summaryData.summaryList.map(item => `
                                    <tr>
                                        <td>
                                            <strong>${item.name}</strong>
                                            <span class="nick-tag">(${item.short_name})</span>
                                        </td>
                                        <td class="text-center font-bold" style="font-size: 1.1rem; color: #f8fafc;">
                                            ${item.class_count}
                                        </td>
                                        <td class="text-right">
                                            ${formatCurrency(item.rate_per_class)}
                                        </td>
                                        <td class="text-right font-bold" style="font-size: 1.1rem; color: #ea580c;">
                                            ${formatCurrency(item.total_amount)}
                                        </td>
                                        <td class="text-center">
                                            <span class="badge-${item.payment_method === 'HOLERITE' ? 'holerite' : 'recibo'}">
                                                ${item.payment_method === 'HOLERITE' ? '📑 Holerite' : '📄 Recibo'}
                                            </span>
                                        </td>
                                        <td class="text-right">
                                            <button class="btn btn-sm btn-outline" onclick="app.openTeacherClassesDetail('${item.id}')">
                                                👁️ Ver Aulas
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                            <tfoot>
                                <tr class="table-total-row">
                                    <td><strong>TOTAL CONSOLIDADO</strong></td>
                                    <td class="text-center font-bold">${summaryData.totals.totalClasses}</td>
                                    <td>-</td>
                                    <td class="text-right font-bold" style="color: #ea580c; font-size: 1.2rem;">
                                        ${formatCurrency(summaryData.totals.totalGeneral)}
                                    </td>
                                    <td colspan="2" class="text-center">
                                        <small>Holerite: ${formatCurrency(summaryData.totals.totalHolerite)} | Recibo: ${formatCurrency(summaryData.totals.totalRecibo)}</small>
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            </div>
        `;
    } catch (err) {
        container.innerHTML = `<div class="error-box">Erro ao calcular fechamento: ${err.message}</div>`;
    }
}

// ── Aba: Grade Semanal ──────────────────────────────────────────────

function renderGradeTab(container) {
    container.innerHTML = `
        <div class="grade-container">
            <div class="grade-header">
                <div>
                    <h3>📅 Grade Semanal de Aulas • Panobianco Boituva</h3>
                    <p>Escala fixa de horários e professores titulares (Segunda a Sábado)</p>
                </div>
                <button class="btn btn-primary" onclick="app.openNewScheduleModal()">
                    ➕ Nova Aula na Grade
                </button>
            </div>

            <div class="grade-grid">
                ${DAYS_OF_WEEK.filter(d => d.id !== 0).map(day => {
                    const dayClasses = state.schedules.filter(s => s.day_of_week === day.id);
                    return `
                        <div class="day-column">
                            <div class="day-header">${day.name.toUpperCase()}</div>
                            <div class="day-classes">
                                ${dayClasses.length === 0 ? `
                                    <div class="empty-day">Sem aulas</div>
                                ` : dayClasses.map(sc => `
                                    <div class="grade-card">
                                        <div class="grade-time">${sc.start_time}</div>
                                        <div class="grade-modality">${sc.modality}</div>
                                        <div class="grade-teacher">${sc.teacher?.short_name || 'Prof'}</div>
                                        <button class="btn-delete-sched" onclick="app.deleteSchedule('${sc.id}')" title="Excluir aula">✕</button>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

// ── Aba: Professores & Valores ──────────────────────────────────────

function renderProfessoresTab(container) {
    container.innerHTML = `
        <div class="professores-container">
            <div class="table-card">
                <div class="table-header">
                    <div>
                        <h3>👥 Corpo Docente • Coletivas Boituva</h3>
                        <p>Valores por aula e formas de recebimento cadastradas</p>
                    </div>
                    <button class="btn btn-primary" onclick="app.openNewTeacherModal()">
                        ➕ Novo Professor
                    </button>
                </div>

                <div class="table-responsive">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Nome Completo</th>
                                <th>Apelido / Grade</th>
                                <th>Código Acesso</th>
                                <th class="text-right">Valor por Aula</th>
                                <th class="text-center">Tipo de Pagamento</th>
                                <th class="text-right">Ação</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${state.teachers.map(t => `
                                <tr>
                                    <td><strong>${t.name}</strong></td>
                                    <td><span class="nick-tag">${t.short_name}</span></td>
                                    <td><code>${t.access_code}</code></td>
                                    <td class="text-right font-bold text-orange">${formatCurrency(t.rate_per_class)}</td>
                                    <td class="text-center">
                                        <span class="badge-${t.payment_method === 'HOLERITE' ? 'holerite' : 'recibo'}">
                                            ${t.payment_method === 'HOLERITE' ? '📑 Holerite' : '📄 Recibo'}
                                        </span>
                                    </td>
                                    <td class="text-right">
                                        <button class="btn btn-sm btn-outline" onclick="app.editTeacherModal('${t.id}')">
                                            ✏️ Editar
                                        </button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

// ── Aba: Todos os Registros (Log de Presenças) ──────────────────────

async function renderRegistrosTab(container) {
    container.innerHTML = `<div class="loading-spinner">Buscando check-ins de ${state.currentMonth}...</div>`;
    try {
        const checkins = await api.getCheckins(state.currentMonth);
        state.adminCheckins = checkins;

        container.innerHTML = `
            <div class="registros-container">
                <div class="table-card">
                    <div class="table-header">
                        <div>
                            <h3>📜 Registro Geral de Presenças • ${getMonthName(state.currentMonth)}</h3>
                            <p>Histórico auditável de todos os check-ins realizados pelos professores</p>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <input type="month" class="month-input" value="${state.currentMonth}" onchange="app.onAdminMonthChange(this.value)">
                            <button class="btn btn-primary" onclick="app.openManualCheckinModal()">
                                ➕ Lançar Aula Manual
                            </button>
                        </div>
                    </div>

                    <div class="table-responsive">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Data / Hora</th>
                                    <th>Professor</th>
                                    <th>Modalidade</th>
                                    <th>Tipo</th>
                                    <th>Valor Aplicado</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${checkins.length === 0 ? `
                                    <tr><td colspan="6" class="text-center">Nenhum check-in registrado neste mês.</td></tr>
                                ` : checkins.map(c => `
                                    <tr>
                                        <td>
                                            <strong>${formatDateBr(c.class_date)}</strong>
                                            <span> às ${c.class_time}</span>
                                        </td>
                                        <td><strong>${c.teacher?.name || 'Professor'}</strong></td>
                                        <td>${c.modality}</td>
                                        <td>
                                            ${c.is_substitution ? `
                                                <span class="badge-subst">Substituiu ${c.original_teacher?.short_name || 'Colega'}</span>
                                            ` : `
                                                <span class="badge-regular">Regular</span>
                                            `}
                                        </td>
                                        <td class="font-bold text-orange">${formatCurrency(c.rate_applied)}</td>
                                        <td>
                                            <button class="btn btn-sm btn-danger" onclick="app.cancelCheckin('${c.id}')" title="Cancelar este lançamento">
                                                ✕ Cancelar
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    } catch (err) {
        container.innerHTML = `<div class="error-box">Erro ao buscar registros: ${err.message}</div>`;
    }
}

// ──────────────────────────────────────────────
// Modais e Diálogos de Apoio
// ──────────────────────────────────────────────

// Modal: Cobrir Aula (Substituição)
function openSubstitutionModal() {
    const teacher = state.currentUser?.teacher;
    if (!teacher) return;

    const modalHtml = `
        <div id="subst-modal" class="modal-overlay active">
            <div class="modal-card">
                <div class="modal-header">
                    <h3>🔄 Cobrir Aula de Colega (Substituição)</h3>
                    <button class="btn-close" onclick="app.closeModal('subst-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <p style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 16px;">
                        Informe qual aula da grade você ministrou no lugar do colega para contabilizarmos para você:
                    </p>

                    <div class="form-group">
                        <label>DATA DA AULA COBERTA:</label>
                        <input type="date" id="subst-date" class="form-control" value="${new Date().toISOString().split('T')[0]}">
                    </div>

                    <div class="form-group" style="margin-top: 12px;">
                        <label>AULA DA GRADE QUE VOCÊ COBRIU:</label>
                        <select id="subst-schedule" class="form-control" onchange="app.onSelectSubstSchedule(this.value)">
                            <option value="">-- Selecione a aula na grade --</option>
                            ${state.schedules.map(sc => {
                                const dayName = DAYS_OF_WEEK.find(d => d.id === sc.day_of_week)?.short || '';
                                return `
                                    <option value="${sc.id}" data-time="${sc.start_time}" data-modality="${sc.modality}" data-orig="${sc.default_teacher_id}">
                                        [${dayName}] ${sc.start_time} — ${sc.modality} (Titular: ${sc.teacher?.short_name || 'Colega'})
                                    </option>
                                `;
                            }).join('')}
                        </select>
                    </div>

                    <div class="form-group" style="margin-top: 12px;">
                        <label>MOTIVO / OBSERVAÇÃO (OPCIONAL):</label>
                        <input type="text" id="subst-notes" class="form-control" placeholder="Ex: Fernanda precisou se ausentar">
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="app.closeModal('subst-modal')">Cancelar</button>
                    <button class="btn btn-primary" onclick="app.confirmSubstitution()">Confirmar Substituição</button>
                </div>
            </div>
        </div>
    `;
    injectModal(modalHtml);
}

// Modal: Detalhes das Aulas do Professor (Gestor)
function openTeacherClassesDetail(teacherId) {
    const summary = state.adminSummary;
    if (!summary) return;

    const teacherData = summary.summaryList.find(s => s.id === teacherId);
    if (!teacherData) return;

    const modalHtml = `
        <div id="teacher-detail-modal" class="modal-overlay active">
            <div class="modal-card modal-lg">
                <div class="modal-header">
                    <div>
                        <h3>📋 Extrato de Aulas: ${teacherData.name}</h3>
                        <p style="font-size: 0.85rem; color: #94a3b8;">${teacherData.class_count} aulas ministradas em ${getMonthName(state.currentMonth)} • Total: ${formatCurrency(teacherData.total_amount)}</p>
                    </div>
                    <button class="btn-close" onclick="app.closeModal('teacher-detail-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Data</th>
                                <th>Horário</th>
                                <th>Modalidade</th>
                                <th>Condição</th>
                                <th class="text-right">Valor da Aula</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${teacherData.classes.length === 0 ? `
                                <tr><td colspan="5" class="text-center">Nenhuma aula registrada no período.</td></tr>
                            ` : teacherData.classes.map(c => `
                                <tr>
                                    <td><strong>${formatDateBr(c.class_date)}</strong></td>
                                    <td>${c.class_time}</td>
                                    <td><strong>${c.modality}</strong></td>
                                    <td>
                                        ${c.is_substitution ? `
                                            <span class="badge-subst">Substituiu ${c.original_teacher?.short_name || 'Colega'}</span>
                                        ` : `
                                            <span class="badge-regular">Regular</span>
                                        `}
                                    </td>
                                    <td class="text-right font-bold text-orange">${formatCurrency(c.rate_applied)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="app.closeModal('teacher-detail-modal')">Fechar</button>
                </div>
            </div>
        </div>
    `;
    injectModal(modalHtml);
}

// Modal: Nova Aula na Grade (Gestor)
function openNewScheduleModal() {
    const modalHtml = `
        <div id="new-schedule-modal" class="modal-overlay active">
            <div class="modal-card">
                <div class="modal-header">
                    <h3>➕ Adicionar Aula na Grade Semanal</h3>
                    <button class="btn-close" onclick="app.closeModal('new-schedule-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>DIA DA SEMANA:</label>
                        <select id="ns-day" class="form-control">
                            <option value="1">Segunda-feira</option>
                            <option value="2">Terça-feira</option>
                            <option value="3">Quarta-feira</option>
                            <option value="4">Quinta-feira</option>
                            <option value="5">Sexta-feira</option>
                            <option value="6">Sábado</option>
                        </select>
                    </div>

                    <div class="form-group" style="margin-top: 12px;">
                        <label>HORÁRIO DE INÍCIO:</label>
                        <input type="time" id="ns-time" class="form-control" value="07:00">
                    </div>

                    <div class="form-group" style="margin-top: 12px;">
                        <label>MODALIDADE:</label>
                        <input type="text" id="ns-modality" class="form-control" placeholder="Ex: FitDance, Spinning, Jump...">
                    </div>

                    <div class="form-group" style="margin-top: 12px;">
                        <label>PROFESSOR TITULAR:</label>
                        <select id="ns-teacher" class="form-control">
                            ${state.teachers.map(t => `
                                <option value="${t.id}">${t.short_name} (${t.name})</option>
                            `).join('')}
                        </select>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="app.closeModal('new-schedule-modal')">Cancelar</button>
                    <button class="btn btn-primary" onclick="app.saveNewSchedule()">Salvar Aula</button>
                </div>
            </div>
        </div>
    `;
    injectModal(modalHtml);
}

// Modal: Cadastrar / Editar Professor (Gestor)
function openNewTeacherModal(existingId = null) {
    const t = existingId ? state.teachers.find(item => item.id === existingId) : null;

    const modalHtml = `
        <div id="teacher-edit-modal" class="modal-overlay active">
            <div class="modal-card">
                <div class="modal-header">
                    <h3>${t ? '✏️ Editar Professor' : '➕ Novo Professor de Coletivas'}</h3>
                    <button class="btn-close" onclick="app.closeModal('teacher-edit-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <input type="hidden" id="tm-id" value="${t ? t.id : ''}">

                    <div class="form-group">
                        <label>NOME COMPLETO:</label>
                        <input type="text" id="tm-name" class="form-control" placeholder="Ex: Karina Xavier Leve" value="${t ? t.name : ''}">
                    </div>

                    <div class="form-group" style="margin-top: 12px;">
                        <label>NOME NA GRADE / APELIDO:</label>
                        <input type="text" id="tm-short-name" class="form-control" placeholder="Ex: Karina" value="${t ? t.short_name : ''}">
                    </div>

                    <div class="form-group" style="margin-top: 12px;">
                        <label>CÓDIGO DE ACESSO DO PROFESSOR:</label>
                        <input type="text" id="tm-code" class="form-control" placeholder="Ex: karina" value="${t ? t.access_code : ''}">
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px;">
                        <div class="form-group">
                            <label>VALOR POR AULA (R$):</label>
                            <input type="number" id="tm-rate" class="form-control" step="0.01" value="${t ? t.rate_per_class : '50.00'}">
                        </div>
                        <div class="form-group">
                            <label>FORMA DE PAGAMENTO:</label>
                            <select id="tm-payment" class="form-control">
                                <option value="RECIBO" ${t?.payment_method === 'RECIBO' ? 'selected' : ''}>Recibo (Autônomo/PJ)</option>
                                <option value="HOLERITE" ${t?.payment_method === 'HOLERITE' ? 'selected' : ''}>Holerite (CLT/Folha)</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="app.closeModal('teacher-edit-modal')">Cancelar</button>
                    <button class="btn btn-primary" onclick="app.saveTeacher()">Salvar Dados</button>
                </div>
            </div>
        </div>
    `;
    injectModal(modalHtml);
}

// Modal: Lançar Aula Manual (Gestor)
function openManualCheckinModal() {
    const modalHtml = `
        <div id="manual-checkin-modal" class="modal-overlay active">
            <div class="modal-card">
                <div class="modal-header">
                    <h3>➕ Lançar Check-in Manual de Aula</h3>
                    <button class="btn-close" onclick="app.closeModal('manual-checkin-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>PROFESSOR QUE MINISTROU:</label>
                        <select id="mc-teacher" class="form-control">
                            ${state.teachers.map(t => `
                                <option value="${t.id}">${t.short_name} (${t.name})</option>
                            `).join('')}
                        </select>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px;">
                        <div class="form-group">
                            <label>DATA DA AULA:</label>
                            <input type="date" id="mc-date" class="form-control" value="${new Date().toISOString().split('T')[0]}">
                        </div>
                        <div class="form-group">
                            <label>HORÁRIO:</label>
                            <input type="time" id="mc-time" class="form-control" value="08:00">
                        </div>
                    </div>

                    <div class="form-group" style="margin-top: 12px;">
                        <label>MODALIDADE:</label>
                        <input type="text" id="mc-modality" class="form-control" placeholder="Ex: FitDance, Jump, Pilates...">
                    </div>

                    <div class="form-group" style="margin-top: 12px;">
                        <label>MOTIVO DO LANÇAMENTO MANUAL:</label>
                        <input type="text" id="mc-notes" class="form-control" placeholder="Ex: Professor esqueceu o celular">
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="app.closeModal('manual-checkin-modal')">Cancelar</button>
                    <button class="btn btn-primary" onclick="app.saveManualCheckin()">Confirmar Registro</button>
                </div>
            </div>
        </div>
    `;
    injectModal(modalHtml);
}

function injectModal(html) {
    const existing = document.getElementById('modal-portal');
    if (existing) existing.remove();

    const portal = document.createElement('div');
    portal.id = 'modal-portal';
    portal.innerHTML = html;
    document.body.appendChild(portal);
}

function closeModal(modalId) {
    const m = document.getElementById(modalId) || document.getElementById('modal-portal');
    if (m) m.remove();
}

// ──────────────────────────────────────────────
// Exportações e Relatórios do Gestor
// ──────────────────────────────────────────────

function exportClosureCSV() {
    const summary = state.adminSummary;
    if (!summary) return;

    let csv = `Nome;Apelido;Quant. Aulas;Valor Unitario (R$);Valor Total (R$);Forma de Pagamento\n`;
    summary.summaryList.forEach(s => {
        csv += `"${s.name}";"${s.short_name}";${s.class_count};"${s.rate_per_class.toFixed(2).replace('.', ',')}";"${s.total_amount.toFixed(2).replace('.', ',')}";"${s.payment_method}"\n`;
    });
    csv += `"TOTAL CONSOLIDADO";"";${summary.totals.totalClasses};"";"${summary.totals.totalGeneral.toFixed(2).replace('.', ',')}";""\n`;

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `fechamento_coletivas_${state.currentMonth}.csv`;
    link.click();
    showToast('📁 Relatório CSV baixado com sucesso!', 'success');
}

function printClosureReport() {
    window.print();
}

function copyWhatsappSummary() {
    const summary = state.adminSummary;
    if (!summary) return;

    let msg = `🏋️ *PANOBIANCO BOITUVA — FECHAMENTO COLETIVAS*\n`;
    msg += `📅 *Referência:* ${getMonthName(state.currentMonth)}\n\n`;

    summary.summaryList.forEach(s => {
        msg += `• *${s.short_name}* (${s.name}): ${s.class_count} aulas x ${formatCurrency(s.rate_per_class)} = *${formatCurrency(s.total_amount)}* (${s.payment_method})\n`;
    });

    msg += `\n📊 *RESUMO GERAL:*\n`;
    msg += `Total de Aulas: *${summary.totals.totalClasses}*\n`;
    msg += `Folha (Holerite): *${formatCurrency(summary.totals.totalHolerite)}*\n`;
    msg += `Recibos (PJ/Autônomo): *${formatCurrency(summary.totals.totalRecibo)}*\n`;
    msg += `💰 *TOTAL A PAGAR: ${formatCurrency(summary.totals.totalGeneral)}*\n`;

    navigator.clipboard.writeText(msg).then(() => {
        showToast('📋 Resumo copiado para o WhatsApp com sucesso!', 'success');
    }).catch(() => {
        prompt('Copie o texto abaixo:', msg);
    });
}

// ──────────────────────────────────────────────
// Notificações Toast
// ──────────────────────────────────────────────

function showToast(message, type = 'info') {
    const existing = document.querySelector('.toast-notification');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    toast.innerText = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('visible');
    }, 10);

    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// ──────────────────────────────────────────────
// Objeto Global (Window.app) para Eventos HTML
// ──────────────────────────────────────────────

window.app = {
    init,
    logout,
    switchLoginMode: (mode) => {
        document.getElementById('tab-login-prof')?.classList.toggle('active', mode === 'prof');
        document.getElementById('tab-login-admin')?.classList.toggle('active', mode === 'admin');
        const formProf = document.getElementById('form-login-prof');
        const formAdmin = document.getElementById('form-login-admin');
        if (formProf) formProf.style.display = mode === 'prof' ? 'block' : 'none';
        if (formAdmin) formAdmin.style.display = mode === 'admin' ? 'block' : 'none';
    },
    onSelectTeacherLogin: (code) => {
        const input = document.getElementById('login-teacher-code');
        if (input && code) input.value = code;
    },
    submitTeacherLogin: () => {
        const code = document.getElementById('login-teacher-code')?.value;
        const pin = document.getElementById('login-teacher-pin')?.value;
        loginTeacher(code, pin);
    },
    submitAdminLogin: () => {
        const code = document.getElementById('login-admin-code')?.value;
        loginTeacher(code || 'admin', null);
    },
    onTeacherMonthChange: (val) => {
        state.currentMonth = val;
        loadTeacherData();
    },
    doCheckin,
    openSubstitutionModal,
    confirmSubstitution: async () => {
        const date = document.getElementById('subst-date')?.value;
        const select = document.getElementById('subst-schedule');
        const notes = document.getElementById('subst-notes')?.value;

        if (!select || !select.value) {
            showToast('Selecione qual aula da grade você cobriu.', 'warning');
            return;
        }

        const option = select.options[select.selectedIndex];
        const time = option.getAttribute('data-time');
        const modality = option.getAttribute('data-modality');
        const origId = option.getAttribute('data-orig');

        try {
            await api.createCheckin({
                teacherId: state.currentUser.teacher.id,
                scheduleId: select.value,
                classDate: date,
                classTime: time,
                modality: modality,
                isSubstitution: true,
                originalTeacherId: origId,
                notes: notes || 'Aula de substituição'
            });

            closeModal('subst-modal');
            showToast(`✅ Substituição registrada para ${modality}!`, 'success');
            await loadTeacherData();
        } catch (err) {
            showToast(`Erro: ${err.message}`, 'danger');
        }
    },
    switchAdminTab: (tab) => {
        currentAdminTab = tab;
        renderAdminDashboard(document.getElementById('app-root'));
    },
    onAdminMonthChange: (val) => {
        state.currentMonth = val;
        loadAdminTabData();
    },
    openTeacherClassesDetail,
    openNewScheduleModal,
    saveNewSchedule: async () => {
        const day = Number(document.getElementById('ns-day')?.value);
        const time = document.getElementById('ns-time')?.value;
        const modality = document.getElementById('ns-modality')?.value;
        const teacherId = document.getElementById('ns-teacher')?.value;

        if (!time || !modality || !teacherId) {
            showToast('Preencha todos os campos da aula.', 'warning');
            return;
        }

        try {
            await api.upsertSchedule({
                day_of_week: day,
                start_time: time,
                modality: modality.trim(),
                default_teacher_id: teacherId
            });
            closeModal('new-schedule-modal');
            showToast('✅ Aula adicionada na grade com sucesso!', 'success');
            state.schedules = await api.getSchedules();
            loadAdminTabData();
        } catch (err) {
            showToast(`Erro ao salvar: ${err.message}`, 'danger');
        }
    },
    deleteSchedule: async (id) => {
        if (!confirm('Deseja realmente remover esta aula da grade semanal?')) return;
        try {
            await api.deleteSchedule(id);
            showToast('Aula removida da grade.', 'info');
            state.schedules = await api.getSchedules();
            loadAdminTabData();
        } catch (err) {
            showToast(`Erro: ${err.message}`, 'danger');
        }
    },
    openNewTeacherModal: () => openNewTeacherModal(null),
    editTeacherModal: (id) => openNewTeacherModal(id),
    saveTeacher: async () => {
        const id = document.getElementById('tm-id')?.value;
        const name = document.getElementById('tm-name')?.value?.trim();
        const shortName = document.getElementById('tm-short-name')?.value?.trim();
        const code = document.getElementById('tm-code')?.value?.trim().toLowerCase();
        const rate = Number(document.getElementById('tm-rate')?.value);
        const payment = document.getElementById('tm-payment')?.value;

        if (!name || !shortName || !code || isNaN(rate)) {
            showToast('Preencha os dados do professor corretamente.', 'warning');
            return;
        }

        try {
            const payload = {
                name,
                short_name: shortName,
                access_code: code,
                rate_per_class: rate,
                payment_method: payment
            };
            if (id) payload.id = id;

            await api.upsertTeacher(payload);
            closeModal('teacher-edit-modal');
            showToast('✅ Dados do professor salvos com sucesso!', 'success');
            state.teachers = await api.getTeachers();
            loadAdminTabData();
        } catch (err) {
            showToast(`Erro: ${err.message}`, 'danger');
        }
    },
    openManualCheckinModal,
    saveManualCheckin: async () => {
        const teacherId = document.getElementById('mc-teacher')?.value;
        const date = document.getElementById('mc-date')?.value;
        const time = document.getElementById('mc-time')?.value;
        const modality = document.getElementById('mc-modality')?.value?.trim();
        const notes = document.getElementById('mc-notes')?.value?.trim();

        if (!teacherId || !date || !time || !modality) {
            showToast('Preencha todos os campos obrigatórios.', 'warning');
            return;
        }

        try {
            await api.createCheckin({
                teacherId,
                classDate: date,
                classTime: time,
                modality,
                isSubstitution: false,
                notes: notes ? `Lançamento manual: ${notes}` : 'Lançamento manual pela gestão'
            });
            closeModal('manual-checkin-modal');
            showToast('✅ Aula manual lançada com sucesso!', 'success');
            loadAdminTabData();
        } catch (err) {
            showToast(`Erro: ${err.message}`, 'danger');
        }
    },
    cancelCheckin: async (id) => {
        if (!confirm('Deseja estornar/cancelar este check-in?')) return;
        try {
            await api.cancelCheckin(id);
            showToast('Check-in cancelado.', 'info');
            loadAdminTabData();
        } catch (err) {
            showToast(`Erro: ${err.message}`, 'danger');
        }
    },
    closeModal,
    exportClosureCSV,
    printClosureReport,
    copyWhatsappSummary
};

// Iniciar a aplicação
document.addEventListener('DOMContentLoaded', init);
