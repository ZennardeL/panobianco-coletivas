/**
 * Panobianco Coletivas — Módulo de Autenticação Biométrica (WebAuthn / Passkeys)
 * Suporte a Impressão Digital (Android / Windows Hello) e Face ID / Touch ID (iOS / Mac).
 */

const STORAGE_KEY = 'panobianco_coletivas_biometric';

// Conversores ArrayBuffer <-> Base64URL
function bufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64ToBuffer(base64) {
    const pad = base64.length % 4;
    const base64Padded = pad ? base64 + '='.repeat(4 - pad) : base64;
    const binary = atob(base64Padded.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

/**
 * Verifica se o dispositivo do usuário possui leitor biométrico ativo e compatível.
 */
export async function isBiometricsAvailable() {
    if (!window.PublicKeyCredential) return false;
    try {
        if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') {
            return false;
        }
        return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch (e) {
        console.warn('Verificação de biometria indisponível:', e);
        return false;
    }
}

/**
 * Retorna os dados da credencial biométrica salva localmente neste dispositivo.
 */
export function getSavedBiometricCredential() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved ? JSON.parse(saved) : null;
    } catch {
        return null;
    }
}

/**
 * Registra a biometria (Digital / Face ID) para o professor logado neste dispositivo.
 */
export async function registerBiometrics(teacher) {
    if (!await isBiometricsAvailable()) {
        throw new Error('Este dispositivo não possui leitor de digital ou Face ID compatível.');
    }

    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    // Identificador único do usuário em bytes
    const userIdBuffer = new TextEncoder().encode(teacher.id || teacher.email);

    const publicKeyCredentialCreationOptions = {
        challenge: challenge,
        rp: {
            name: 'Panobianco Coletivas',
            id: window.location.hostname
        },
        user: {
            id: userIdBuffer,
            name: teacher.email || teacher.short_name,
            displayName: teacher.name || teacher.short_name
        },
        pubKeyCredParams: [
            { alg: -7, type: 'public-key' },   // ES256 (Padrão mais compatível)
            { alg: -257, type: 'public-key' }  // RS256 (Fallback Windows Hello)
        ],
        authenticatorSelection: {
            authenticatorAttachment: 'platform', // Plataforma nativa (digital do celular / Face ID)
            userVerification: 'required',
            residentKey: 'preferred'
        },
        timeout: 60000,
        attestation: 'none'
    };

    const credential = await navigator.credentials.create({
        publicKey: publicKeyCredentialCreationOptions
    });

    if (!credential) {
        throw new Error('Registro biométrico cancelado.');
    }

    const credentialIdBase64 = bufferToBase64(credential.rawId);

    // Salvar localmente no dispositivo para login rápido
    const localData = {
        credentialId: credentialIdBase64,
        teacherId: teacher.id,
        teacherName: teacher.name,
        teacherShortName: teacher.short_name,
        teacherEmail: teacher.email,
        registeredAt: new Date().toISOString()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(localData));

    return credentialIdBase64;
}

/**
 * Autentica o usuário solicitando a leitura da digital / Face ID.
 */
export async function authenticateWithBiometrics() {
    if (!await isBiometricsAvailable()) {
        throw new Error('Biometria não suportada neste dispositivo.');
    }

    const saved = getSavedBiometricCredential();
    if (!saved || !saved.credentialId) {
        throw new Error('Nenhuma biometria cadastrada neste aparelho. Faça login com e-mail e senha primeiro para ativar.');
    }

    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    const rawIdBuffer = base64ToBuffer(saved.credentialId);

    const publicKeyCredentialRequestOptions = {
        challenge: challenge,
        rpId: window.location.hostname,
        allowCredentials: [{
            id: rawIdBuffer,
            type: 'public-key',
            transports: ['internal']
        }],
        userVerification: 'required',
        timeout: 60000
    };

    const assertion = await navigator.credentials.get({
        publicKey: publicKeyCredentialRequestOptions
    });

    if (!assertion) {
        throw new Error('Validação biométrica cancelada.');
    }

    // Retorna os dados do professor autenticado com sucesso
    return saved;
}

/**
 * Remove a biometria salva neste dispositivo.
 */
export function removeBiometrics() {
    localStorage.removeItem(STORAGE_KEY);
}
