/**
 * Vercel Serverless Function — Envio de E-mail de Confirmação de Check-in
 */
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido. Use POST.' });
    }

    try {
        const {
            to,
            teacherName,
            modality,
            classDate,
            classTime,
            unitName = 'Panobianco Academia — Boituva',
            isSubstitution = false,
            coveredTeacher = null,
            apiKey = process.env.RESEND_API_KEY
        } = req.body;

        if (!to) {
            return res.status(400).json({ error: 'Destinatário (to) é obrigatório.' });
        }

        const formattedDate = classDate ? classDate.split('-').reverse().join('/') : new Date().toLocaleDateString('pt-BR');
        const subject = `✅ Check-in Confirmado: ${modality} (${classTime}) - Panobianco`;

        const htmlBody = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <style>
                    body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 20px; }
                    .card { max-width: 500px; margin: 0 auto; background: #1e293b; border-radius: 14px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); }
                    .header { background: #ea580c; padding: 20px; text-align: center; color: #ffffff; }
                    .header h1 { margin: 0; font-size: 1.25rem; font-weight: 800; letter-spacing: 0.5px; }
                    .content { padding: 24px; color: #cbd5e1; }
                    .highlight-box { background: rgba(234, 88, 12, 0.1); border: 1px solid rgba(234, 88, 12, 0.3); border-radius: 8px; padding: 16px; margin: 16px 0; }
                    .row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.95rem; }
                    .row strong { color: #f8fafc; }
                    .badge { display: inline-block; background: #10b981; color: #ffffff; font-weight: bold; font-size: 0.75rem; padding: 4px 8px; border-radius: 99px; }
                    .footer { padding: 16px; text-align: center; font-size: 0.75rem; color: #64748b; border-top: 1px solid rgba(255,255,255,0.05); }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="header">
                        <h1>PANOBIANCO COLETIVAS</h1>
                    </div>
                    <div class="content">
                        <p style="font-size: 1.1rem; color: #ffffff; margin-top: 0;">Olá, <strong>${teacherName || 'Professor(a)'}</strong>! 👋</p>
                        <p>Seu check-in de aula foi registrado com sucesso no sistema da academia.</p>
                        
                        <div class="highlight-box">
                            <div class="row">
                                <span>Modalidade:</span>
                                <strong>${modality}</strong>
                            </div>
                            <div class="row">
                                <span>Data:</span>
                                <strong>${formattedDate}</strong>
                            </div>
                            <div class="row">
                                <span>Horário:</span>
                                <strong>${classTime}</strong>
                            </div>
                            ${isSubstitution ? `
                            <div class="row">
                                <span>Tipo:</span>
                                <strong style="color: #ea580c;">Substituição (${coveredTeacher || 'Colega'})</strong>
                            </div>` : ''}
                            <div class="row" style="margin-top: 12px; margin-bottom: 0;">
                                <span>Status:</span>
                                <span class="badge">PRESENÇA CONFIRMADA</span>
                            </div>
                        </div>

                        <p style="font-size: 0.85rem; color: #94a3b8;">
                            Este registro foi computado para o fechamento mensal da sua folha de aulas no RH.
                        </p>
                    </div>
                    <div class="footer">
                        ${unitName} • Sistema de Aulas Coletivas
                    </div>
                </div>
            </body>
            </html>
        `;

        // Se tiver Resend API Key configurada
        const key = apiKey || process.env.RESEND_API_KEY;
        if (key) {
            const resendRes = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${key}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    from: 'Panobianco Coletivas <onboarding@resend.dev>',
                    to: [to],
                    subject: subject,
                    html: htmlBody
                })
            });

            const data = await resendRes.json();
            if (!resendRes.ok) {
                console.warn('Erro na resposta do Resend:', data);
                return res.status(200).json({
                    success: false,
                    warning: 'Check-in computado, mas o envio de e-mail falhou via provedor.',
                    details: data
                });
            }

            return res.status(200).json({
                success: true,
                messageId: data.id,
                emailTo: to
            });
        }

        // Sem API Key configurada no ambiente: registra com sucesso simulado
        return res.status(200).json({
            success: true,
            simulated: true,
            emailTo: to,
            note: 'E-mail preparado com sucesso. Para envio real em produção, adicione a variável RESEND_API_KEY no painel da Vercel ou na tela do Gestor.'
        });

    } catch (err) {
        console.error('Erro ao processar envio de email:', err);
        return res.status(500).json({ error: err.message });
    }
}
