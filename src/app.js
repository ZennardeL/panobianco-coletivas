/**
 * Panobianco Coletivas — Aplicação Principal (Controlador & Renderizador)
 */
import { CONFIG } from './config.js';
import * as api from './api.js';
import * as biometrics from './biometrics.js';

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ──────────────────────────────────────────────
// Estado da Aplicação
// ──────────────────────────────────────────────
const state = {
    currentUser: null,       // { role: 'TEACHER' | 'ADMIN', teacher?: object, name: string, email?: string }
    teachers: [],
    schedules: [],
    currentMonth: getCurrentYearMonth(), // 'YYYY-MM'
    teacherCheckins: [],     // Check-ins do professor logado no mês
    adminSummary: null,      // Relatório consolidado do mês
    adminCheckins: []        // Todos os check-ins do mês
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

    // Carregar dados de professores e grade
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
// Tela 1: Login Seguro (Email & Senha / Sem Vazamento)
// ──────────────────────────────────────────────

function renderLoginView(container) {
    const savedBio = biometrics.getSavedBiometricCredential();
    const hasBiometrics = savedBio && savedBio.credentialId;

    container.innerHTML = `
        <div class="login-container">
            <div class="login-card">
                <div class="login-header">
                    <div class="brand-badge">PANOBIANCO COLETIVAS</div>
                    <h1>Acesso ao Sistema</h1>
                    <p>Controle de presença e fechamento mensal da grade de aulas</p>
                </div>

                <div class="login-tabs">
                    <button class="tab-btn active" id="tab-login-prof" onclick="app.switchLoginMode('prof')">
                        🏋️ Professor
                    </button>
                    <button class="tab-btn" id="tab-login-admin" onclick="app.switchLoginMode('admin')">
                        💼 Gestor / RH
                    </button>
                </div>

                <!-- Formulário Professor (E-mail e Senha) -->
                <div id="form-login-prof" class="login-form-body">
                    ${hasBiometrics ? `
                        <div class="bio-login-container">
                            <button type="button" class="btn btn-biometric btn-block" onclick="app.loginWithBiometrics()">
                                <span class="bio-main">👆 Entrar com Digital / Face ID</span>
                                <span class="bio-sub">Conectado para: <strong>${escapeHtml(savedBio.teacherShortName || savedBio.teacherName)}</strong></span>
                            </button>
                            <div style="display: flex; align-items: center; text-align: center; margin: 16px 0; color: #64748b; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.5px;">
                                <span style="flex: 1; border-bottom: 1px solid #334155;"></span>
                                <span style="padding: 0 10px;">OU ENTRE COM E-MAIL E SENHA</span>
                                <span style="flex: 1; border-bottom: 1px solid #334155;"></span>
                            </div>
                        </div>
                    ` : ''}
                    <form onsubmit="event.preventDefault(); app.submitTeacherLogin();">
                        <div class="form-group">
                            <label>SEU E-MAIL CADASTRADO:</label>
                            <input type="email" id="login-teacher-email" class="form-control" placeholder="ex: karina@email.com" autocomplete="email" required>
                        </div>

                        <div class="form-group" style="margin-top: 14px;">
                            <label>SUA SENHA:</label>
                            <input type="password" id="login-teacher-password" class="form-control" placeholder="••••••••" autocomplete="current-password" required>
                        </div>

                        <button type="submit" class="btn btn-primary btn-block" style="margin-top: 20px;">
                            🚀 Entrar no Meu Painel
                        </button>
                    </form>

                    <div class="first-access-box">
                        <p>Primeira vez acessando?</p>
                        <button class="btn btn-sm btn-outline btn-block" onclick="app.openFirstAccessModal()">
                            ✨ Criar minha senha / Primeiro Acesso
                        </button>
                    </div>
                </div>

                <!-- Formulário Gestor (Seguro • Sem vazamento de exemplos) -->
                <div id="form-login-admin" class="login-form-body" style="display: none;">
                    <form onsubmit="event.preventDefault(); app.submitAdminLogin();">
                        <div class="form-group">
                            <label>USUÁRIO OU E-MAIL DO GESTOR:</label>
                            <input type="text" id="login-admin-user" class="form-control" placeholder="Usuário ou e-mail" autocomplete="username" required>
                        </div>

                        <div class="form-group" style="margin-top: 14px;">
                            <label>SENHA DE ACESSO:</label>
                            <input type="password" id="login-admin-pass" class="form-control" placeholder="••••••••" autocomplete="current-password" required>
                        </div>

                        <button type="submit" class="btn btn-primary btn-block" style="margin-top: 20px;">
                            🔒 Acessar Painel do Gestor
                        </button>
                    </form>
                </div>

                <div class="login-footer">
                    <small>Unidade Boituva • Panobianco Academia</small>
                </div>
            </div>
        </div>
    `;
}

// Modal: Primeiro Acesso do Professor (Criação de E-mail e Senha)
function openFirstAccessModal() {
    const modalHtml = `
        <div id="first-access-modal" class="modal-overlay active">
            <div class="modal-card">
                <div class="modal-header">
                    <h3>✨ Primeiro Acesso • Criar Senha</h3>
                    <button class="btn-close" onclick="app.closeModal('first-access-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <p style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 16px;">
                        Selecione seu nome na lista oficial da academia, cadastre seu e-mail pessoal e crie uma senha segura para seus próximos acessos:
                    </p>

                    <div class="form-group">
                        <label>QUEM É VOCÊ (PROFESSOR):</label>
                        <select id="fa-teacher-id" class="form-control">
                            <option value="">-- Selecione seu nome --</option>
                            ${state.teachers.map(t => `
                                <option value="${t.id}">${t.name} (${t.short_name})</option>
                            `).join('')}
                        </select>
                    </div>

                    <div class="form-group" style="margin-top: 14px;">
                        <label>SEU E-MAIL PESSOAL (PARA RECEBER CONFIRMAÇÕES):</label>
                        <input type="email" id="fa-email" class="form-control" placeholder="seu-email@gmail.com">
                        <span style="font-size: 0.72rem; color: #94a3b8; margin-top: 3px;">
                            Você receberá o comprovante de cada aula dada neste e-mail.
                        </span>
                    </div>

                    <div class="form-group" style="margin-top: 14px;">
                        <label>CRIE SUA SENHA (MÍNIMO 4 DÍGITOS):</label>
                        <input type="password" id="fa-pass" class="form-control" placeholder="••••••••">
                    </div>

                    <div class="form-group" style="margin-top: 14px;">
                        <label>CONFIRME SUA SENHA:</label>
                        <input type="password" id="fa-pass-confirm" class="form-control" placeholder="••••••••">
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="app.closeModal('first-access-modal')">Cancelar</button>
                    <button class="btn btn-primary" onclick="app.confirmFirstAccess()">Criar Conta & Entrar</button>
                </div>
            </div>
        </div>
    `;
    injectModal(modalHtml);
}

// ──────────────────────────────────────────────
// Tela 2: Visão do Professor (Mobile-First)
// ──────────────────────────────────────────────

async function renderTeacherDashboard(container) {
    const teacher = state.currentUser.teacher;
    const isBioAvailable = await biometrics.isBiometricsAvailable();
    const savedBio = biometrics.getSavedBiometricCredential();
    const hasDeviceBio = savedBio && savedBio.teacherId === teacher.id;

    container.innerHTML = `
        <div class="mobile-layout">
            <header class="app-header">
                <div class="header-left">
                    <span class="brand-tag">PANOBIANCO COLETIVAS</span>
                    <h2>Olá, ${escapeHtml(teacher.short_name)}! 👋</h2>
                    <p class="header-subtitle">${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                    ${hasDeviceBio ? `
                        <div style="margin-top: 4px; display: flex; align-items: center;">
                            <span class="bio-active-tag" title="Biometria ativa neste aparelho">👆 Digital Ativa</span>
                            <button class="btn-text-link" onclick="app.disableBiometrics()" style="font-size: 0.68rem; color: #94a3b8; text-decoration: underline; background: none; border: none; cursor: pointer; margin-left: 8px;">(Desativar)</button>
                        </div>
                    ` : ''}
                </div>
                <div class="header-right">
                    <button class="btn-logout" onclick="app.logout()" title="Sair da conta">
                        🚪 Sair
                    </button>
                </div>
            </header>

            <main class="mobile-main">
                ${(isBioAvailable && !hasDeviceBio) ? `
                    <div class="biometric-activation-banner" id="bio-banner">
                        <div class="bio-icon">👆</div>
                        <div class="bio-text">
                            <strong>Ativar Login por Digital ou Face ID</strong>
                            <p>Entre no app com apenas 1 toque na sua digital nos próximos acessos.</p>
                        </div>
                        <button class="btn btn-sm btn-primary" onclick="app.enableBiometrics()">Ativar Agora</button>
                    </div>
                ` : ''}

                <!-- Seção 1: Check-in de Aulas (SEMPRE ACESSÍVEL E VISÍVEL) -->
                <section class="section-card today-checkin-card">
                    <div class="card-header">
                        <h3>📍 Check-in de Aulas</h3>
                        <span class="live-dot" title="Sincronizado"></span>
                    </div>

                    <div id="teacher-today-classes" class="classes-list">
                        <div class="loading-spinner">Carregando suas aulas...</div>
                    </div>

                    <div class="quick-checkin-banner" style="margin-top: 14px; text-align: center;">
                        <button class="btn btn-primary btn-block" style="padding: 14px; font-size: 1rem;" onclick="app.openManualTeacherCheckinModal()">
                            📍 Registrar Check-in (Aula Avulsa ou Especial)
                        </button>
                    </div>
                </section>

                <!-- Seção 2: Minhas Aulas na Grade Semanal -->
                <section class="section-card my-schedules-card">
                    <div class="card-header">
                        <h3>📅 Minha Grade Semanal Fixa</h3>
                        <small style="color: #ea580c; font-weight: 700;">Boituva</small>
                    </div>
                    <div id="teacher-weekly-schedules" class="weekly-mini-grid">
                        <!-- Inserido dinamicamente -->
                    </div>
                </section>

                <!-- Seção 3: Resumo do Mês (PRIVACIDADE TOTAL - SEM R$) -->
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
                        🔒 Os valores em R$ constam no fechamento financeiro do seu holerite/recibo via RH.<br>
                        📧 Você recebe um e-mail de confirmação em <strong>${teacher.email || 'seu e-mail'}</strong> a cada aula dada.
                    </div>
                </section>

                <!-- Seção 4: Histórico de Presenças do Mês -->
                <section class="section-card history-card">
                    <h3>📜 Histórico de Presenças</h3>
                    <div id="teacher-checkin-history" class="history-list">
                        <div class="loading-spinner">Carregando histórico...</div>
                    </div>
                </section>
            </main>
        </div>
    `;

    await loadTeacherData();
}

async function loadTeacherData() {
    const teacher = state.currentUser.teacher;
    const today = new Date();
    const todayDayOfWeek = today.getDay(); // 0 a 6
    const todayDateStr = today.toISOString().split('T')[0];

    try {
        const checkins = await api.getCheckins(state.currentMonth, teacher.id);
        state.teacherCheckins = checkins;

        // Atualizar contador do mês (SEM NENHUM VALOR EM R$)
        const badgeEl = document.getElementById('teacher-total-classes-badge');
        if (badgeEl) {
            badgeEl.innerText = `${checkins.length}`;
        }

        // Aulas de hoje do professor
        const todaySchedules = state.schedules.filter(s => 
            s.day_of_week === todayDayOfWeek && s.default_teacher_id === teacher.id
        );

        // Todas as aulas do professor na semana
        const myAllSchedules = state.schedules.filter(s => s.default_teacher_id === teacher.id);

        // Check-ins já realizados hoje
        const todayDoneCheckins = checkins.filter(c => c.class_date === todayDateStr);

        renderTodayClassesList(todaySchedules, todayDoneCheckins, todayDateStr);
        renderMyWeeklySchedules(myAllSchedules);
        renderTeacherHistoryList(checkins);

    } catch (err) {
        console.error('Erro ao carregar dados do professor:', err);
        showToast('Erro ao atualizar dados.', 'danger');
    }
}

function renderTodayClassesList(schedules, doneCheckins, todayDateStr) {
    const container = document.getElementById('teacher-today-classes');
    if (!container) return;

    const dayName = new Date().toLocaleDateString('pt-BR', { weekday: 'long' });

    if (schedules.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 16px 8px;">
                <p style="font-weight: 700; color: #f8fafc; margin-bottom: 4px;">Hoje é ${dayName}.</p>
                <p style="font-size: 0.85rem; color: #94a3b8;">Você não possui aulas programadas na grade regular para hoje.</p>
                <small style="color: #64748b;">Se você deu um aulão, evento ou aula especial hoje, use o botão laranja abaixo.</small>
            </div>
        `;
        return;
    }

    container.innerHTML = schedules.map(sched => {
        const isDone = doneCheckins.find(c => 
            c.class_time === sched.start_time && c.modality === sched.modality
        );

        return `
            <div class="class-item ${isDone ? 'done' : 'pending'}">
                <div class="class-time">${sched.start_time}</div>
                <div class="class-details">
                    <span class="class-modality">${sched.modality}</span>
                    <span class="class-role">Aula Regular de Hoje (${dayName})</span>
                </div>
                <div class="class-action">
                    ${isDone ? `
                        <span class="badge-done">✅ Confirmada</span>
                    ` : `
                        <button class="btn btn-checkin" onclick="app.openConfirmCheckinModal('${sched.id}', '${sched.start_time}', '${sched.modality}', false)">
                            📍 Confirmar Presença
                        </button>
                    `}
                </div>
            </div>
        `;
    }).join('');
}

function renderMyWeeklySchedules(schedules) {
    const container = document.getElementById('teacher-weekly-schedules');
    if (!container) return;

    if (schedules.length === 0) {
        container.innerHTML = `<div class="empty-state"><p>Você ainda não possui aulas cadastradas na grade semanal.</p></div>`;
        return;
    }

    container.innerHTML = schedules.map(sc => {
        const day = DAYS_OF_WEEK.find(d => d.id === sc.day_of_week);
        return `
            <div class="my-sched-pill">
                <span class="pill-day">${day ? day.short : ''}</span>
                <span class="pill-time">${sc.start_time}</span>
                <span class="pill-mod">${sc.modality}</span>
                <button class="btn btn-sm btn-outline" style="padding: 4px 8px; font-size: 0.75rem;" onclick="app.openConfirmCheckinModal('${sc.id}', '${sc.start_time}', '${sc.modality}', false)" title="Registrar presença nesta aula hoje">
                    📍 Check-in
                </button>
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
                    <span class="badge-subst">Substituição aprovada pela gestão (${c.original_teacher?.short_name || 'Colega'})</span>
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

// Check-in do Professor
async function doCheckin(scheduleId, classTime, modality, isSubstitution, studentsCount = 0, notes = '', originalTeacherId = null) {
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
            notes: notes,
            studentsCount: studentsCount
        });

        showToast(`🎉 Check-in confirmado! E-mail de confirmação enviado para ${teacher.email || 'seu e-mail'}.`, 'success');
        await loadTeacherData();
    } catch (err) {
        console.error('Erro ao realizar checkin:', err);
        showToast(`❌ Falha no check-in: ${err.message}`, 'danger');
    }
}

function openConfirmCheckinModal(scheduleId, classTime, modality, isSubstitution) {
    const modalHtml = `
        <div id="confirm-checkin-modal" class="modal-overlay active">
            <div class="modal-card">
                <div class="modal-header">
                    <h3>📍 Confirmar Presença: ${modality}</h3>
                    <button class="btn-close" onclick="app.closeModal('confirm-checkin-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <p style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 14px;">
                        Preencha os dados abaixo para confirmar sua aula das <strong>${classTime}</strong>.
                    </p>

                    <div class="form-group">
                        <label>QUANTIDADE DE ALUNOS PRESENTES:</label>
                        <input type="number" id="cc-students" class="form-control" placeholder="Ex: 15" min="0" required>
                    </div>

                    <div class="form-group" style="margin-top: 14px;">
                        <label>OBSERVAÇÕES DA AULA (OPCIONAL):</label>
                        <textarea id="cc-notes" class="form-control" rows="3" placeholder="Problemas com equipamento, alunos novos, brigas, etc..."></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="app.closeModal('confirm-checkin-modal')">Cancelar</button>
                    <button class="btn btn-primary" onclick="app.confirmScheduledCheckin('${scheduleId}', '${classTime}', '${modality}', ${isSubstitution})">
                        ✔️ Confirmar Presença
                    </button>
                </div>
            </div>
        </div>
    `;
    injectModal(modalHtml);
}

// Modal: Check-in Manual do Professor (Para dias sem grade ou horários especiais)
function openManualTeacherCheckinModal() {
    const teacher = state.currentUser.teacher;
    const today = new Date().toISOString().split('T')[0];
    const nowTime = new Date().toTimeString().slice(0, 5);

    const modalHtml = `
        <div id="manual-teacher-checkin-modal" class="modal-overlay active">
            <div class="modal-card">
                <div class="modal-header">
                    <h3>📍 Registrar Check-in de Aula</h3>
                    <button class="btn-close" onclick="app.closeModal('manual-teacher-checkin-modal')">✕</button>
                </div>
                <div class="modal-body">
                    <p style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 14px;">
                        Confirme os dados da aula que você ministrou para registrar sua presença:
                    </p>

                    <div class="form-group">
                        <label>MODALIDADE DA AULA:</label>
                        <input type="text" id="mtc-modality" class="form-control" placeholder="Ex: FitDance, Jump, Pilates, Yoga, Funcional...">
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px;">
                        <div class="form-group">
                            <label>DATA:</label>
                            <input type="date" id="mtc-date" class="form-control" value="${today}">
                        </div>
                        <div class="form-group">
                            <label>HORÁRIO DE INÍCIO:</label>
                            <input type="time" id="mtc-time" class="form-control" value="${nowTime}">
                        </div>
                    </div>

                    <div class="form-group" style="margin-top: 14px;">
                        <label>QUANTIDADE DE ALUNOS PRESENTES:</label>
                        <input type="number" id="mtc-students" class="form-control" placeholder="Ex: 15" min="0" required>
                    </div>

                    <div class="form-group" style="margin-top: 14px;">
                        <label>OBSERVAÇÕES DA AULA (OPCIONAL):</label>
                        <textarea id="mtc-notes" class="form-control" rows="3" placeholder="Problemas com equipamento, alunos novos, brigas, etc..."></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="app.closeModal('manual-teacher-checkin-modal')">Cancelar</button>
                    <button class="btn btn-primary" onclick="app.confirmManualTeacherCheckin()">Confirmar Presença</button>
                </div>
            </div>
        </div>
    `;
    injectModal(modalHtml);
}

// ──────────────────────────────────────────────
// Tela 3: Painel do Gestor / RH
// ──────────────────────────────────────────────

let currentAdminTab = 'fechamento'; // 'fechamento', 'substituicao', 'grade', 'professores', 'registros', 'config'

async function renderAdminDashboard(container) {
    container.innerHTML = `
        <div class="admin-layout">
            <header class="admin-header">
                <div class="header-left">
                    <span class="brand-tag">PANOBIANCO ACADEMIA</span>
                    <h2>Painel do Gestor • Coletivas</h2>
                    <p class="header-subtitle">Boituva • Controle de Presenças e Folha Salarial</p>
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
                <button class="tab-btn ${currentAdminTab === 'substituicao' ? 'active' : ''}" onclick="app.switchAdminTab('substituicao')">
                    🔄 Lançar Substituição
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
                <button class="tab-btn ${currentAdminTab === 'config' ? 'active' : ''}" onclick="app.switchAdminTab('config')">
                    ⚙️ Segurança & E-mail
                </button>
                <button class="tab-btn ${currentAdminTab === 'equipe' ? 'active' : ''}" onclick="app.switchAdminTab('equipe')">
                    🔑 Equipe & Acessos
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
    } else if (currentAdminTab === 'substituicao') {
        renderSubstituicaoTab(container);
    } else if (currentAdminTab === 'grade') {
        renderGradeTab(container);
    } else if (currentAdminTab === 'professores') {
        renderProfessoresTab(container);
    } else if (currentAdminTab === 'registros') {
        await renderRegistrosTab(container);
    } else if (currentAdminTab === 'config') {
        await renderConfigTab(container);
    } else if (currentAdminTab === 'equipe') {
        await renderEquipeTab(container);
    }
}

// ── Aba: Fechamento do Mês ──────────────────────────────────────────

async function renderFechamentoTab(container) {
    container.innerHTML = `<div class="loading-spinner">Calculando fechamento de ${state.currentMonth}...</div>`;

    try {
        const summaryData = await api.getMonthClosureSummary(state.currentMonth);
        state.adminSummary = summaryData;

        container.innerHTML = `
            <div class="fechamento-container">
                <div class="fechamento-toolbar">
                    <div class="toolbar-left">
                        <label>MÊS DE REFERÊNCIA:</label>
                        <input type="month" class="month-input" value="${state.currentMonth}" onchange="app.onAdminMonthChange(this.value)">
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

                <!-- Cards de Resumo -->
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

                <!-- Tabela Consolidada -->
                <div class="table-card" style="margin-top: 20px;">
                    <div class="table-header">
                        <h3>📋 Tabela de Acerto Salarial • ${getMonthName(state.currentMonth)}</h3>
                        <small>Conferência oficial idêntica à planilha de fechamento</small>
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

// ── Aba: Lançar Substituição (EXCLUSIVO GESTOR) ──────────────────────

function renderSubstituicaoTab(container) {
    const today = new Date().toISOString().split('T')[0];

    container.innerHTML = `
        <div class="subst-container" style="max-width: 650px; margin: 0 auto;">
            <div class="table-card" style="padding: 24px;">
                <div class="table-header" style="padding: 0 0 16px 0; margin-bottom: 20px;">
                    <div>
                        <h3>🔄 Registrar Substituição de Aula</h3>
                        <p>Lançamento oficial realizado pelo gestor quando um professor cobre outro</p>
                    </div>
                </div>

                <div class="form-group">
                    <label>DATA EM QUE A AULA OCORREU:</label>
                    <input type="date" id="admin-subst-date" class="form-control" value="${today}">
                </div>

                <div class="form-group" style="margin-top: 16px;">
                    <label>QUAL AULA DA GRADE FOI COBERTA (TITULAR QUE FALTOU):</label>
                    <select id="admin-subst-schedule" class="form-control">
                        <option value="">-- Selecione a aula na grade --</option>
                        ${state.schedules.map(sc => {
                            const day = DAYS_OF_WEEK.find(d => d.id === sc.day_of_week)?.short || '';
                            return `
                                <option value="${sc.id}" data-time="${sc.start_time}" data-modality="${sc.modality}" data-orig="${sc.default_teacher_id}">
                                    [${day}] ${sc.start_time} — ${sc.modality} (Titular: ${sc.teacher?.name || 'Prof'})
                                </option>
                            `;
                        }).join('')}
                    </select>
                </div>

                <div class="form-group" style="margin-top: 16px;">
                    <label>PROFESSOR QUE COBRIU A AULA (VAI RECEBER O CRÉDITO):</label>
                    <select id="admin-subst-covering-teacher" class="form-control">
                        <option value="">-- Selecione quem deu a aula --</option>
                        ${state.teachers.map(t => `
                            <option value="${t.id}">${t.name} (${t.short_name})</option>
                        `).join('')}
                    </select>
                </div>

                <div class="form-group" style="margin-top: 16px;">
                    <label>MOTIVO / OBSERVAÇÃO DO ACORDO:</label>
                    <input type="text" id="admin-subst-notes" class="form-control" placeholder="Ex: Titular em consulta médica, combinado previamente com a gestão">
                </div>

                <button class="btn btn-primary btn-block" style="margin-top: 24px; padding: 14px;" onclick="app.submitAdminSubstitution()">
                    ✅ Confirmar e Creditar Substituição
                </button>
            </div>
        </div>
    `;
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
                        <h3>👥 Professores & Contas de Acesso • Boituva</h3>
                        <p>Valores por aula, formas de pagamento e e-mails cadastrados</p>
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
                                <th>Apelido</th>
                                <th>E-mail de Login</th>
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
                                    <td>${t.email ? `<code>${t.email}</code>` : `<span style="color: #ea580c; font-size: 0.8rem;">⚠️ Não cadastrado</span>`}</td>
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

// ── Aba: Todos os Registros ─────────────────────────────────────────

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
                            <p>Histórico auditável de todos os check-ins realizados</p>
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
                                    <th>Alunos</th>
                                    <th>Tipo</th>
                                    <th>Valor Aplicado</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${checkins.length === 0 ? `
                                    <tr><td colspan="7" class="text-center">Nenhum check-in registrado neste mês.</td></tr>
                                ` : checkins.map(c => `
                                    <tr>
                                        <td>
                                            <strong>${formatDateBr(c.class_date)}</strong>
                                            <span> às ${c.class_time}</span>
                                        </td>
                                        <td><strong>${c.teacher?.name || 'Professor'}</strong></td>
                                        <td>
                                            ${c.modality}
                                            ${c.notes ? `<div style="font-size: 0.75rem; color: #94a3b8; max-width: 150px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${c.notes}">📝 ${c.notes}</div>` : ''}
                                        </td>
                                        <td><strong>${c.students_count || 0}</strong></td>
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

// ── Aba: Segurança & Configuração de E-mail ──────────────────────────

async function renderConfigTab(container) {
    container.innerHTML = `<div class="loading-spinner">Carregando configurações...</div>`;
    try {
        const settings = await api.getAdminSettings();

        container.innerHTML = `
            <div class="config-container" style="max-width: 600px; margin: 0 auto;">
                <div class="table-card" style="padding: 24px;">
                    <div class="table-header" style="padding: 0 0 16px 0; margin-bottom: 20px;">
                        <div>
                            <h3>⚙️ Segurança do Gestor & E-mail</h3>
                            <p>Altere suas credenciais de acesso e a chave de envio de e-mails</p>
                        </div>
                    </div>

                    <h4 style="color: #ea580c; margin-bottom: 12px; font-size: 0.95rem;">🔒 Credenciais do Gestor</h4>
                    
                    <div class="form-group">
                        <label>USUÁRIO DO GESTOR:</label>
                        <input type="text" id="cfg-admin-user" class="form-control" value="${settings?.admin_user || 'gestor'}">
                    </div>

                    <div class="form-group" style="margin-top: 14px;">
                        <label>E-MAIL DO GESTOR:</label>
                        <input type="email" id="cfg-admin-email" class="form-control" value="${settings?.admin_email || ''}">
                    </div>

                    <div class="form-group" style="margin-top: 14px;">
                        <label>NOVA SENHA DO GESTOR:</label>
                        <input type="password" id="cfg-admin-pass" class="form-control" placeholder="Deixe em branco para não alterar">
                    </div>

                    <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 24px 0;">

                    <h4 style="color: #ea580c; margin-bottom: 12px; font-size: 0.95rem;">📧 Envio de E-mails de Confirmação</h4>
                    <p style="font-size: 0.8rem; color: #94a3b8; margin-bottom: 14px;">
                        O sistema envia um e-mail de confirmação aos professores a cada check-in. Você pode utilizar o serviço gratuito <strong>Resend</strong> (3.000 e-mails grátis/mês):
                    </p>

                    <div class="form-group">
                        <label>RESEND API KEY (OPCIONAL):</label>
                        <input type="password" id="cfg-resend-key" class="form-control" placeholder="re_123456789..." value="${settings?.resend_api_key || ''}">
                        <small style="color: #64748b; margin-top: 4px;">Obtenha grátis em resend.com ou adicione como variável de ambiente na Vercel.</small>
                    </div>

                    <button class="btn btn-primary btn-block" style="margin-top: 24px; padding: 14px;" onclick="app.saveAdminSettings()">
                        💾 Salvar Configurações
                    </button>
                </div>
            </div>
        `;
    } catch (err) {
        container.innerHTML = `<div class="error-box">Erro ao carregar configurações: ${err.message}</div>`;
    }
}

// ── Aba: Equipe & Acessos (Gestores) ────────────────────────────────

async function renderEquipeTab(container) {
    container.innerHTML = `<div class="loading-spinner">Carregando equipe...</div>`;
    try {
        const admins = await api.getAdmins();

        container.innerHTML = `
            <div class="professores-container">
                <div class="table-card">
                    <div class="table-header">
                        <div>
                            <h3>🔑 Equipe & Acessos de Gestores</h3>
                            <p>Cadastre gestores que podem acessar o painel administrativo</p>
                        </div>
                        <button class="btn btn-primary" onclick="app.openAdminModal()">
                            ➕ Novo Gestor
                        </button>
                    </div>

                    <div class="table-responsive">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Nome</th>
                                    <th>E-mail de Login</th>
                                    <th class="text-center">Status</th>
                                    <th class="text-right">Ação</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${admins.length === 0 ? `
                                    <tr><td colspan="4" style="text-align:center; color:#94a3b8; padding:24px;">Nenhum gestor cadastrado ainda.</td></tr>
                                ` : admins.map(a => `
                                    <tr>
                                        <td><strong>${escapeHtml(a.name)}</strong></td>
                                        <td><code>${escapeHtml(a.email)}</code></td>
                                        <td class="text-center">
                                            <span class="badge-${a.active ? 'holerite' : 'recibo'}">
                                                ${a.active ? '✅ Ativo' : '🚫 Inativo'}
                                            </span>
                                        </td>
                                        <td class="text-right" style="display:flex; gap:6px; justify-content:flex-end;">
                                            <button class="btn btn-sm btn-outline" onclick="app.openAdminModal('${a.id}')">
                                                ✏️ Editar
                                            </button>
                                            <button class="btn btn-sm btn-outline" style="color:#ef4444; border-color:#ef4444;" onclick="app.deleteAdminAction('${a.id}', '${escapeHtml(a.name)}')">
                                                🗑️
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="table-card" style="margin-top: 16px; padding: 16px;">
                    <p style="font-size: 0.82rem; color: #94a3b8; margin: 0;">
                        ℹ️ <strong>Gestores</strong> têm acesso total ao painel administrativo: fechamento, grade, professores, registros e configurações.
                        Cada gestor faz login com seu próprio e-mail e senha.
                    </p>
                </div>
            </div>
        `;
    } catch (err) {
        container.innerHTML = `<div class="error-box">Erro ao carregar equipe: ${err.message}</div>`;
    }
}

function openAdminModal(existingId = null) {
    let admin = null;
    if (existingId) {
        // Buscar dados do admin no DOM não é ideal; vamos re-buscar da API
        // Para simplificar, vamos usar um fetch inline
    }

    const isEdit = !!existingId;
    const title = isEdit ? '✏️ Editar Gestor' : '➕ Novo Gestor';

    const modalHtml = `
        <div class="modal-overlay active" id="admin-modal" onclick="if(event.target===this) app.closeModal('admin-modal')">
            <div class="modal-content" style="max-width: 480px;">
                <div class="modal-header">
                    <h3>${title}</h3>
                    <button class="modal-close" onclick="app.closeModal('admin-modal')">&times;</button>
                </div>
                <div class="modal-body">
                    <div id="admin-modal-loading" style="display: ${isEdit ? 'block' : 'none'};">
                        <div class="loading-spinner">Carregando dados...</div>
                    </div>
                    <div id="admin-modal-form" style="display: ${isEdit ? 'none' : 'block'};">
                        <input type="hidden" id="admin-modal-id" value="${existingId || ''}">
                        
                        <div class="form-group">
                            <label>NOME COMPLETO:</label>
                            <input type="text" id="admin-modal-name" class="form-control" placeholder="Ex: Maria Silva">
                        </div>

                        <div class="form-group" style="margin-top: 14px;">
                            <label>E-MAIL (USADO PARA LOGIN):</label>
                            <input type="email" id="admin-modal-email" class="form-control" placeholder="Ex: maria@panobianco.com">
                        </div>

                        <div class="form-group" style="margin-top: 14px;">
                            <label>${isEdit ? 'NOVA SENHA (deixe em branco para manter)' : 'SENHA'}:</label>
                            <input type="password" id="admin-modal-password" class="form-control" placeholder="${isEdit ? 'Manter senha atual' : 'Mínimo 4 caracteres'}">
                        </div>

                        <div id="admin-modal-error" class="error-box" style="display:none; margin-top:14px;"></div>

                        <button class="btn btn-primary btn-block" style="margin-top: 20px; padding: 14px;" onclick="app.saveAdminModal()">
                            💾 ${isEdit ? 'Salvar Alterações' : 'Cadastrar Gestor'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    injectModal(modalHtml);

    // Se for edição, carregar dados do admin
    if (isEdit) {
        api.getAdmins().then(admins => {
            const a = admins.find(x => x.id === existingId);
            if (a) {
                document.getElementById('admin-modal-name').value = a.name;
                document.getElementById('admin-modal-email').value = a.email;
            }
            document.getElementById('admin-modal-loading').style.display = 'none';
            document.getElementById('admin-modal-form').style.display = 'block';
        });
    }
}

async function saveAdminModal() {
    const id = document.getElementById('admin-modal-id').value;
    const name = document.getElementById('admin-modal-name').value.trim();
    const email = document.getElementById('admin-modal-email').value.trim();
    const password = document.getElementById('admin-modal-password').value.trim();
    const errorEl = document.getElementById('admin-modal-error');

    errorEl.style.display = 'none';

    try {
        if (id) {
            // Edição
            const updates = { name, email };
            if (password) updates.password = password;
            await api.updateAdmin(id, updates);
            showToast('✅ Gestor atualizado com sucesso!', 'success');
        } else {
            // Criação
            if (!password) {
                errorEl.innerText = 'A senha é obrigatória para novos gestores.';
                errorEl.style.display = 'block';
                return;
            }
            await api.createAdmin({ name, email, password });
            showToast('✅ Gestor cadastrado com sucesso!', 'success');
        }
        closeModal('admin-modal');
        await renderEquipeTab(document.getElementById('admin-view-content'));
    } catch (err) {
        errorEl.innerText = err.message;
        errorEl.style.display = 'block';
    }
}

async function deleteAdminAction(adminId, adminName) {
    if (!confirm(`Tem certeza que deseja excluir o gestor "${adminName}"?\n\nEsta ação não pode ser desfeita.`)) return;
    try {
        await api.deleteAdmin(adminId);
        showToast(`🗑️ Gestor "${adminName}" excluído.`, 'info');
        await renderEquipeTab(document.getElementById('admin-view-content'));
    } catch (err) {
        showToast(`❌ ${err.message}`, 'danger');
    }
}

// ──────────────────────────────────────────────
// Modais e Diálogos de Apoio
// ──────────────────────────────────────────────

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
                        <label>E-MAIL PARA LOGIN & CONFIRMAÇÃO:</label>
                        <input type="email" id="tm-email" class="form-control" placeholder="professor@email.com" value="${t?.email || ''}">
                    </div>

                    <div class="form-group" style="margin-top: 12px;">
                        <label>SENHA DE ACESSO DO PROFESSOR:</label>
                        <input type="text" id="tm-pass" class="form-control" placeholder="Senha" value="${t?.password || '123456'}">
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
        msg += `• *${s.short_name}* (${s.name}): ${s.class_count} aulas (${s.total_students} alunos) x ${formatCurrency(s.rate_per_class)} = *${formatCurrency(s.total_amount)}* (${s.payment_method})\n`;
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
    openFirstAccessModal,
    confirmFirstAccess: async () => {
        const teacherId = document.getElementById('fa-teacher-id')?.value;
        const email = document.getElementById('fa-email')?.value?.trim();
        const pass = document.getElementById('fa-pass')?.value;
        const passConfirm = document.getElementById('fa-pass-confirm')?.value;

        if (!teacherId || !email || !pass) {
            showToast('Preencha todos os campos.', 'warning');
            return;
        }

        if (pass !== passConfirm) {
            showToast('As senhas digitadas não coincidem.', 'danger');
            return;
        }

        try {
            const updated = await api.registerTeacherEmailPassword(teacherId, email, pass);
            closeModal('first-access-modal');
            showToast(`✅ Conta ativada com sucesso! Olá, ${updated.short_name}!`, 'success');

            state.currentUser = {
                role: 'TEACHER',
                teacher: updated,
                name: updated.short_name || updated.name,
                email: updated.email
            };
            localStorage.setItem('panobianco_coletivas_session', JSON.stringify(state.currentUser));
            renderApp();
        } catch (err) {
            showToast(`❌ ${err.message}`, 'danger');
        }
    },
    submitTeacherLogin: async () => {
        const email = document.getElementById('login-teacher-email')?.value;
        const pass = document.getElementById('login-teacher-password')?.value;

        try {
            const teacher = await api.loginTeacherWithEmail(email, pass);
            state.currentUser = {
                role: 'TEACHER',
                teacher: teacher,
                name: teacher.short_name || teacher.name,
                email: teacher.email
            };
            localStorage.setItem('panobianco_coletivas_session', JSON.stringify(state.currentUser));
            showToast(`✅ Olá, ${teacher.short_name}!`, 'success');
            renderApp();
        } catch (err) {
            showToast(`❌ ${err.message}`, 'danger');
        }
    },
    submitAdminLogin: async () => {
        const user = document.getElementById('login-admin-user')?.value;
        const pass = document.getElementById('login-admin-pass')?.value;

        try {
            const adminSession = await api.loginAdmin(user, pass);
            state.currentUser = adminSession;
            localStorage.setItem('panobianco_coletivas_session', JSON.stringify(state.currentUser));
            showToast('✅ Acesso de Gestor confirmado!', 'success');
            renderApp();
        } catch (err) {
            showToast(`❌ ${err.message}`, 'danger');
        }
    },
    onTeacherMonthChange: (val) => {
        state.currentMonth = val;
        loadTeacherData();
    },
    doCheckin,
    openConfirmCheckinModal,
    confirmScheduledCheckin: async (scheduleId, classTime, modality, isSubstitution) => {
        const studentsCount = document.getElementById('cc-students')?.value || 0;
        const notes = document.getElementById('cc-notes')?.value?.trim();

        if (!studentsCount || studentsCount < 0) {
            showToast('Preencha a quantidade de alunos presentes.', 'warning');
            return;
        }

        closeModal('confirm-checkin-modal');
        await doCheckin(scheduleId, classTime, modality, isSubstitution, studentsCount, notes, null);
    },
    openManualTeacherCheckinModal,
    confirmManualTeacherCheckin: async () => {
        const modality = document.getElementById('mtc-modality')?.value?.trim();
        const date = document.getElementById('mtc-date')?.value;
        const time = document.getElementById('mtc-time')?.value;
        const notes = document.getElementById('mtc-notes')?.value?.trim();
        const studentsCount = document.getElementById('mtc-students')?.value || 0;

        if (!modality || !date || !time) {
            showToast('Preencha a modalidade, data e horário da aula.', 'warning');
            return;
        }

        try {
            await api.createCheckin({
                teacherId: state.currentUser.teacher.id,
                classDate: date,
                classTime: time,
                modality: modality,
                isSubstitution: false,
                notes: notes ? `Check-in avulso: ${notes}` : 'Check-in avulso do professor',
                studentsCount: studentsCount
            });

            closeModal('manual-teacher-checkin-modal');
            showToast(`🎉 Presença confirmada em ${modality}! E-mail enviado.`, 'success');
            await loadTeacherData();
        } catch (err) {
            showToast(`Erro: ${err.message}`, 'danger');
        }
    },
    switchAdminTab: (tab) => {
        currentAdminTab = tab;
        const main = document.getElementById('admin-view-content');
        if (main) {
            document.querySelectorAll('.admin-tabs .tab-btn').forEach(btn => {
                const isActive = btn.getAttribute('onclick')?.includes(`'${tab}'`);
                btn.classList.toggle('active', !!isActive);
                if (isActive) {
                    btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                }
            });
            loadAdminTabData();
        } else {
            renderAdminDashboard(document.getElementById('app-root'));
        }
    },
    onAdminMonthChange: (val) => {
        state.currentMonth = val;
        loadAdminTabData();
    },
    submitAdminSubstitution: async () => {
        const date = document.getElementById('admin-subst-date')?.value;
        const selectSched = document.getElementById('admin-subst-schedule');
        const coveringTeacherId = document.getElementById('admin-subst-covering-teacher')?.value;
        const notes = document.getElementById('admin-subst-notes')?.value?.trim();

        if (!date || !selectSched?.value || !coveringTeacherId) {
            showToast('Preencha todos os campos para registrar a substituição.', 'warning');
            return;
        }

        const option = selectSched.options[selectSched.selectedIndex];
        const time = option.getAttribute('data-time');
        const modality = option.getAttribute('data-modality');
        const origTeacherId = option.getAttribute('data-orig');

        try {
            await api.createCheckin({
                teacherId: coveringTeacherId,
                scheduleId: selectSched.value,
                classDate: date,
                classTime: time,
                modality: modality,
                isSubstitution: true,
                originalTeacherId: origTeacherId,
                notes: notes ? `Substituição aprovada pela gestão: ${notes}` : 'Substituição aprovada pela gestão'
            });

            showToast(`✅ Substituição registrada com sucesso e creditada ao professor!`, 'success');
            currentAdminTab = 'fechamento';
            renderAdminDashboard(document.getElementById('app-root'));
        } catch (err) {
            showToast(`Erro ao registrar: ${err.message}`, 'danger');
        }
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
        const email = document.getElementById('tm-email')?.value?.trim().toLowerCase();
        const pass = document.getElementById('tm-pass')?.value?.trim();
        const rate = Number(document.getElementById('tm-rate')?.value);
        const payment = document.getElementById('tm-payment')?.value;

        if (!name || !shortName || isNaN(rate)) {
            showToast('Preencha os dados do professor corretamente.', 'warning');
            return;
        }

        try {
            const payload = {
                name,
                short_name: shortName,
                access_code: shortName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ''),
                email: email || null,
                rate_per_class: rate,
                payment_method: payment
            };
            if (pass) payload.password = pass;
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
    saveAdminSettings: async () => {
        const adminUser = document.getElementById('cfg-admin-user')?.value?.trim();
        const adminEmail = document.getElementById('cfg-admin-email')?.value?.trim();
        const newPass = document.getElementById('cfg-admin-pass')?.value?.trim();
        const resendKey = document.getElementById('cfg-resend-key')?.value?.trim();

        if (!adminUser) {
            showToast('O usuário do gestor não pode ficar em branco.', 'warning');
            return;
        }

        try {
            const payload = {
                admin_user: adminUser,
                admin_email: adminEmail,
                resend_api_key: resendKey || null
            };
            if (newPass) payload.admin_password = newPass;

            await api.updateAdminSettings(payload);
            showToast('✅ Configurações e senha do gestor atualizadas com sucesso!', 'success');
            loadAdminTabData();
        } catch (err) {
            showToast(`Erro ao salvar configurações: ${err.message}`, 'danger');
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
    loginWithBiometrics: async () => {
        try {
            const bioData = await biometrics.authenticateWithBiometrics();
            
            let teacher = state.teachers.find(t => t.id === bioData.teacherId);
            if (!teacher) {
                const freshTeachers = await api.getTeachers();
                state.teachers = freshTeachers;
                teacher = freshTeachers.find(t => t.id === bioData.teacherId);
            }

            if (!teacher) {
                throw new Error('Professor não encontrado no cadastro ativo.');
            }

            state.currentUser = {
                role: 'TEACHER',
                teacher: teacher,
                name: teacher.short_name || teacher.name,
                email: teacher.email
            };
            localStorage.setItem('panobianco_coletivas_session', JSON.stringify(state.currentUser));
            showToast(`✅ Bem-vindo(a) via Digital, ${teacher.short_name}!`, 'success');
            renderApp();
        } catch (err) {
            if (err.name === 'NotAllowedError' || err.message?.includes('cancel')) {
                showToast('Validação biométrica cancelada.', 'info');
            } else {
                showToast(`❌ ${err.message}`, 'danger');
            }
        }
    },
    enableBiometrics: async () => {
        try {
            const teacher = state.currentUser?.teacher;
            if (!teacher) return;

            showToast('Toque no leitor de digital ou olhe para o Face ID...', 'info');
            const credentialId = await biometrics.registerBiometrics(teacher);

            await api.updateTeacherBiometric(teacher.id, credentialId);

            showToast('🎉 Digital / Face ID ativado com sucesso neste celular!', 'success');
            renderApp();
        } catch (err) {
            if (err.name === 'NotAllowedError' || err.message?.includes('cancel')) {
                showToast('Ativação biométrica cancelada.', 'info');
            } else {
                showToast(`❌ Não foi possível ativar: ${err.message}`, 'danger');
            }
        }
    },
    disableBiometrics: async () => {
        if (!confirm('Deseja desativar o login por digital neste celular?')) return;
        biometrics.removeBiometrics();
        showToast('Biometria desativada deste aparelho.', 'info');
        renderApp();
    },
    exportClosureCSV,
    printClosureReport,
    copyWhatsappSummary,
    openAdminModal,
    saveAdminModal,
    deleteAdminAction
};

// Iniciar a aplicação
document.addEventListener('DOMContentLoaded', init);
