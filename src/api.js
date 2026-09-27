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

export async function getTeacherByCode(code, pin) {
    const sb = getClient();
    const cleanCode = (code || '').trim().toLowerCase();
    const cleanPin = (pin || '').trim();

    const { data, error } = await sb
        .from('coletivas_teachers')
        .select('*')
        .eq('tenant_id', CONFIG.tenantId)
        .ilike('access_code', cleanCode)
        .eq('active', true)
        .single();

    if (error || !data) return null;

    // Se tiver PIN configurado no banco e informado pelo usuário
    if (data.pin && cleanPin && data.pin !== cleanPin) {
        throw new Error('PIN incorreto.');
    }

    return data;
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
            teacher:coletivas_teachers(id, name, short_name, rate_per_class, payment_method)
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
// Check-ins e Aulas Realizadas
// ──────────────────────────────────────────────

export async function getCheckins(monthYearStr, teacherId = null) {
    const sb = getClient();
    // monthYearStr: 'YYYY-MM'
    const startDate = `${monthYearStr}-01`;
    // Fim do mês (aproximado 31 dias)
    const [year, month] = monthYearStr.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${monthYearStr}-${String(lastDay).padStart(2, '0')}`;

    let query = sb
        .from('coletivas_checkins')
        .select(`
            *,
            teacher:coletivas_teachers!teacher_id(id, name, short_name, rate_per_class, payment_method),
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
    notes = ''
}) {
    const sb = getClient();

    // Se rateApplied não for passado, busca do professor
    let rate = rateApplied;
    let paymentMethod = paymentMethodApplied;
    if (!rate || !paymentMethod) {
        const { data: t } = await sb
            .from('coletivas_teachers')
            .select('rate_per_class, payment_method')
            .eq('id', teacherId)
            .single();
        if (t) {
            rate = rate || t.rate_per_class;
            paymentMethod = paymentMethod || t.payment_method;
        }
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
        rate_applied: rate || 50.00,
        payment_method_applied: paymentMethod || 'RECIBO',
        notes: notes || null
    };

    const { data, error } = await sb
        .from('coletivas_checkins')
        .insert(payload)
        .select(`
            *,
            teacher:coletivas_teachers!teacher_id(id, name, short_name),
            original_teacher:coletivas_teachers!original_teacher_id(id, name, short_name)
        `)
        .single();

    if (error) throw error;
    return data;
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

    // Mapear contagem por professor
    const summaryMap = {};
    teachers.forEach(t => {
        summaryMap[t.id] = {
            id: t.id,
            name: t.name,
            short_name: t.short_name,
            access_code: t.access_code,
            rate_per_class: Number(t.rate_per_class) || 0,
            payment_method: t.payment_method,
            class_count: 0,
            total_amount: 0,
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
                rate_per_class: Number(chk.rate_applied) || 0,
                payment_method: chk.payment_method_applied || 'RECIBO',
                class_count: 0,
                total_amount: 0,
                classes: []
            };
        }
        summaryMap[tId].class_count += 1;
        summaryMap[tId].total_amount += Number(chk.rate_applied) || 0;
        summaryMap[tId].classes.push(chk);
    });

    // Converter para array ordenado por quantidade de aulas
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
