/**
 * Panobianco Coletivas — Camada de Dados (Supabase Client)
 */
import { CONFIG } from './config.js';

let supabaseClient = null;

export function initSupabase() {
    if (typeof window.supabase === 'undefined') {
        throw new Error('SDK do Supabase não foi carregado.');
    }
    if (!supabaseClient) {
        supabaseClient = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
    }
    return supabaseClient;
}

function getClient() {
    if (!supabaseClient) return initSupabase();
    return supabaseClient;
}

// ──────────────────────────────────────────────
// Autenticação & Configurações
// ──────────────────────────────────────────────

export async function loginTeacherWithEmail(email, password) {
    const sb = getClient();
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPassword = (password || '').trim();

    if (!cleanEmail || !cleanPassword) {
        throw new Error('Informe seu e-mail e senha para entrar.');
    }

    const { data, error } = await sb
        .from('coletivas_teachers')
        .select('*')
        .eq('tenant_id', CONFIG.tenantId)
        .ilike('email', cleanEmail)
        .eq('active', true)
        .maybeSingle();

    if (error) throw error;
    if (!data) {
        throw new Error('E-mail não cadastrado no sistema. Se for seu primeiro acesso, clique em "Criar Minha Senha".');
    }

    if (data.password !== cleanPassword) {
        throw new Error('Senha incorreta. Verifique suas credenciais.');
    }

    return data;
}

export async function registerTeacherEmailPassword(teacherId, email, password) {
    const sb = getClient();
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPassword = (password || '').trim();

    if (!teacherId) throw new Error('Selecione seu nome na lista da academia.');
    if (!cleanEmail || !cleanEmail.includes('@')) throw new Error('Informe um e-mail válido.');
    if (!cleanPassword || cleanPassword.length < 4) throw new Error('A senha deve ter pelo menos 4 caracteres.');

    // Verificar se e-mail já está sendo usado por outro professor
    const { data: existing } = await sb
        .from('coletivas_teachers')
        .select('id, name')
        .eq('tenant_id', CONFIG.tenantId)
        .ilike('email', cleanEmail)
        .neq('id', teacherId)
        .maybeSingle();

    if (existing) {
        throw new Error(`Este e-mail já está cadastrado para ${existing.name}. Use outro e-mail.`);
    }

    const { data, error } = await sb
        .from('coletivas_teachers')
        .update({
            email: cleanEmail,
            password: cleanPassword
        })
        .eq('id', teacherId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function updateTeacherBiometric(teacherId, credentialId) {
    const sb = getClient();
    const { data, error } = await sb
        .from('coletivas_teachers')
        .update({
            biometric_credential_id: credentialId
        })
        .eq('id', teacherId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function getAdminSettings() {
    const sb = getClient();
    const { data, error } = await sb
        .from('coletivas_settings')
        .select('*')
        .eq('tenant_id', CONFIG.tenantId)
        .maybeSingle();
    if (error) throw error;
    return data;
}

export async function loginAdmin(userOrEmail, password) {
    const cleanUser = (userOrEmail || '').trim().toLowerCase();
    const cleanPass = (password || '').trim();

    if (!cleanUser || !cleanPass) {
        throw new Error('Digite o usuário/e-mail e a senha do Gestor.');
    }

    const settings = await getAdminSettings();
    if (!settings) {
        // Fallback se não configurado
        if ((cleanUser === 'gestor' || cleanUser === 'admin') && cleanPass === 'boituva2026') {
            return { role: 'ADMIN', name: 'Gestor Panobianco' };
        }
        throw new Error('Configuração de gestor não encontrada.');
    }

    const validUser = (settings.admin_user && settings.admin_user.toLowerCase() === cleanUser) ||
                      (settings.admin_email && settings.admin_email.toLowerCase() === cleanUser);

    if (validUser && settings.admin_password === cleanPass) {
        return {
            role: 'ADMIN',
            name: 'Gestão Panobianco Boituva',
            email: settings.admin_email
        };
    }

    throw new Error('Usuário ou senha de gestor incorretos.');
}

export async function updateAdminSettings(settingsData) {
    const sb = getClient();
    const payload = {
        tenant_id: CONFIG.tenantId,
        updated_at: new Date().toISOString(),
        ...settingsData
    };
    const { data, error } = await sb
        .from('coletivas_settings')
        .upsert(payload, { onConflict: 'tenant_id' })
        .select()
        .single();
    if (error) throw error;
    return data;
}

// ──────────────────────────────────────────────
// Professores
// ──────────────────────────────────────────────

export async function getTeachers() {
    const sb = getClient();
    const { data, error } = await sb
        .from('coletivas_teachers')
        .select('*')
        .eq('tenant_id', CONFIG.tenantId)
        .order('name');
    if (error) throw error;
    return data || [];
}

export async function upsertTeacher(teacherData) {
    const sb = getClient();
    const payload = {
        tenant_id: CONFIG.tenantId,
        ...teacherData
    };
    const { data, error } = await sb
        .from('coletivas_teachers')
        .upsert(payload)
        .select()
        .single();
    if (error) throw error;
    return data;
}

// ──────────────────────────────────────────────
// Grade Semanal de Aulas
// ──────────────────────────────────────────────

export async function getSchedules() {
    const sb = getClient();
    const { data, error } = await sb
        .from('coletivas_schedules')
        .select(`
            *,
            teacher:coletivas_teachers(id, name, short_name, email, rate_per_class, payment_method)
        `)
        .eq('tenant_id', CONFIG.tenantId)
        .eq('active', true)
        .order('day_of_week')
        .order('start_time');
    if (error) throw error;
    return data || [];
}

export async function upsertSchedule(scheduleData) {
    const sb = getClient();
    const payload = {
        tenant_id: CONFIG.tenantId,
        ...scheduleData
    };
    const { data, error } = await sb
        .from('coletivas_schedules')
        .upsert(payload)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function deleteSchedule(scheduleId) {
    const sb = getClient();
    const { error } = await sb
        .from('coletivas_schedules')
        .update({ active: false })
        .eq('id', scheduleId);
    if (error) throw error;
    return true;
}

// ──────────────────────────────────────────────
// Check-ins e Notificações por E-mail
// ──────────────────────────────────────────────

export async function getCheckins(monthYearStr, teacherId = null) {
    const sb = getClient();
    const startDate = `${monthYearStr}-01`;
    const [year, month] = monthYearStr.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${monthYearStr}-${String(lastDay).padStart(2, '0')}`;

    let query = sb
        .from('coletivas_checkins')
        .select(`
            *,
            teacher:coletivas_teachers!teacher_id(id, name, short_name, email, rate_per_class, payment_method),
            original_teacher:coletivas_teachers!original_teacher_id(id, name, short_name)
        `)
        .eq('tenant_id', CONFIG.tenantId)
        .gte('class_date', startDate)
        .lte('class_date', endDate)
        .eq('status', 'CONFIRMADA')
        .order('class_date', { ascending: false })
        .order('class_time', { ascending: false });

    if (teacherId) {
        query = query.eq('teacher_id', teacherId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

export async function createCheckin({
    teacherId,
    scheduleId,
    classDate,
    classTime,
    modality,
    isSubstitution = false,
    originalTeacherId = null,
    rateApplied,
    paymentMethodApplied,
    notes = '',
    studentsCount = 0
}) {
    const sb = getClient();

    // 1. Evitar duplicidade de check-ins (mesmo dia, mesma hora, mesmo professor e modalidade)
    const { data: existing, error: checkErr } = await sb
        .from('coletivas_checkins')
        .select('id')
        .eq('tenant_id', CONFIG.tenantId)
        .eq('teacher_id', teacherId)
        .eq('class_date', classDate)
        .eq('class_time', classTime)
        .eq('modality', modality)
        .eq('status', 'CONFIRMADA')
        .limit(1);
    
    if (existing && existing.length > 0) {
        throw new Error('Check-in já foi realizado para esta aula hoje.');
    }

    // 2. Obter dados do professor para aplicar valor e obter e-mail
    const { data: t } = await sb
        .from('coletivas_teachers')
        .select('id, name, short_name, email, rate_per_class, payment_method')
        .eq('id', teacherId)
        .single();

    const rate = rateApplied || (t ? t.rate_per_class : 50.00);
    const paymentMethod = paymentMethodApplied || (t ? t.payment_method : 'RECIBO');

    let origTeacherName = null;
    if (originalTeacherId) {
        const { data: ot } = await sb
            .from('coletivas_teachers')
            .select('short_name, name')
            .eq('id', originalTeacherId)
            .single();
        if (ot) origTeacherName = ot.short_name || ot.name;
    }

    const payload = {
        tenant_id: CONFIG.tenantId,
        schedule_id: scheduleId || null,
        teacher_id: teacherId,
        class_date: classDate,
        class_time: classTime,
        modality: modality,
        is_substitution: isSubstitution,
        original_teacher_id: originalTeacherId || null,
        status: 'CONFIRMADA',
        rate_applied: rate,
        payment_method_applied: paymentMethod,
        notes: notes || null,
        students_count: Number(studentsCount) || 0
    };

    const { data, error } = await sb
        .from('coletivas_checkins')
        .insert(payload)
        .select(`
            *,
            teacher:coletivas_teachers!teacher_id(id, name, short_name, email),
            original_teacher:coletivas_teachers!original_teacher_id(id, name, short_name)
        `)
        .single();

    if (error) throw error;

    // Disparar envio de e-mail de confirmação para o professor (se tiver e-mail cadastrado)
    if (t?.email) {
        sendCheckinConfirmationEmail({
            to: t.email,
            teacherName: t.name,
            modality: modality,
            classDate: classDate,
            classTime: classTime,
            isSubstitution: isSubstitution,
            coveredTeacher: origTeacherName,
            teacherId: t.id
        }).catch(e => console.warn('Aviso: envio de e-mail assíncrono:', e));
    }

    return data;
}

export async function sendCheckinConfirmationEmail({
    to,
    teacherName,
    modality,
    classDate,
    classTime,
    isSubstitution = false,
    coveredTeacher = null,
    teacherId = null
}) {
    const sb = getClient();
    try {
        const settings = await getAdminSettings();
        const res = await fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                to,
                teacherName,
                modality,
                classDate,
                classTime,
                isSubstitution,
                coveredTeacher,
                apiKey: settings?.resend_api_key
            })
        });

        const result = await res.json();

        // Gravar no log de auditoria de e-mails
        await sb.from('coletivas_email_logs').insert({
            tenant_id: CONFIG.tenantId,
            teacher_id: teacherId,
            to_email: to,
            subject: `Check-in Confirmado: ${modality} (${classTime})`,
            body_preview: `${teacherName} • ${classDate} ${classTime} • ${modality}`,
            status: result.success ? 'SENT' : 'FAILED'
        });

        return result;
    } catch (err) {
        console.warn('Falha na requisição de e-mail:', err);
    }
}

export async function cancelCheckin(checkinId) {
    const sb = getClient();
    const { error } = await sb
        .from('coletivas_checkins')
        .update({ status: 'CANCELADA' })
        .eq('id', checkinId);
    if (error) throw error;
    return true;
}

// ──────────────────────────────────────────────
// Relatório Consolidado de Fechamento do Mês
// ──────────────────────────────────────────────

export async function getMonthClosureSummary(monthYearStr) {
    const [checkins, teachers] = await Promise.all([
        getCheckins(monthYearStr),
        getTeachers()
    ]);

    const summaryMap = {};
    teachers.forEach(t => {
        summaryMap[t.id] = {
            id: t.id,
            name: t.name,
            short_name: t.short_name,
            email: t.email,
            rate_per_class: Number(t.rate_per_class) || 0,
            payment_method: t.payment_method,
            class_count: 0,
            total_amount: 0,
            total_students: 0,
            classes: []
        };
    });

    checkins.forEach(chk => {
        const tId = chk.teacher_id;
        if (!summaryMap[tId]) {
            summaryMap[tId] = {
                id: tId,
                name: chk.teacher?.name || 'Professor',
                short_name: chk.teacher?.short_name || 'Prof',
                email: chk.teacher?.email || null,
                rate_per_class: Number(chk.rate_applied) || 0,
                payment_method: chk.payment_method_applied || 'RECIBO',
                class_count: 0,
                total_amount: 0,
                total_students: 0,
                classes: []
            };
        }
        summaryMap[tId].class_count += 1;
        summaryMap[tId].total_amount += Number(chk.rate_applied) || 0;
        summaryMap[tId].total_students += Number(chk.students_count) || 0;
        summaryMap[tId].classes.push(chk);
    });

    const summaryList = Object.values(summaryMap).filter(item => item.class_count > 0 || item.rate_per_class > 0);
    summaryList.sort((a, b) => b.class_count - a.class_count);

    const totals = {
        totalClasses: checkins.length,
        totalHolerite: summaryList
            .filter(s => s.payment_method === 'HOLERITE')
            .reduce((acc, s) => acc + s.total_amount, 0),
        totalRecibo: summaryList
            .filter(s => s.payment_method === 'RECIBO')
            .reduce((acc, s) => acc + s.total_amount, 0),
        totalGeneral: summaryList.reduce((acc, s) => acc + s.total_amount, 0)
    };

    return {
        monthYear: monthYearStr,
        summaryList,
        totals,
        rawCheckins: checkins
    };
}
