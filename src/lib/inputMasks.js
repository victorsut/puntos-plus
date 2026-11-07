// src/lib/inputMasks.js
// Máscaras de escritura continua para campos de login/registro.
// Patrón: el estado guarda el valor CRUDO (sin separadores) para que
// validaciones y BD no cambien; el input muestra format(raw) y clean()
// convierte lo tecleado de vuelta a crudo. Los separadores (espacios,
// guión) se insertan solos mientras el usuario escribe sin pausas.

// Teléfono GT: 8 dígitos mostrados como "XXXX XXXX"
export const phoneMask = {
  clean:  v => v.replace(/\D/g, '').slice(0, 8),
  format: v => (v.length > 4 ? v.slice(0, 4) + ' ' + v.slice(4) : v),
};

// DPI: 13 dígitos agrupados 4-5-4 → "XXXX XXXXX XXXX"
export const dpiMask = {
  clean:  v => v.replace(/\D/g, '').slice(0, 13),
  format: v => [v.slice(0, 4), v.slice(4, 9), v.slice(9, 13)].filter(Boolean).join(' '),
};

// Placa GT: 1–2 letras + 3 números + 3 letras → "P 123 ABC" / "CD 123 ABC".
// UX-46 (7-nov-2026): antes solo aceptaba 1 letra de prefijo y se tragaba
// en silencio CD/CC/MI/TC (cuerpo diplomático, consular, misión, taxi).
// Los espacios son SOLO visuales: en estado y BD la placa va sin espacios.
// clean() acepta caracteres solo si encajan en la posición que toca,
// así el teclado puede escribir de corrido sin separadores.
const PLATE_RE = /^([A-Z]{1,2})(\d{3})([A-Z]{3})$/;
export const plateMask = {
  clean: v => {
    let out = '';
    for (const ch of v.toUpperCase().replace(/[^A-Z0-9]/g, '')) {
      const pre = (out.match(/^[A-Z]+/) || [''])[0].length; // letras de prefijo ya escritas
      const rest = out.length - pre;                           // dígitos + letras finales
      if (rest === 0 && pre < 2 && /[A-Z]/.test(ch)) out += ch;
      else if (pre >= 1 && rest < 3 && /[0-9]/.test(ch)) out += ch;
      else if (pre >= 1 && rest >= 3 && rest < 6 && /[A-Z]/.test(ch)) out += ch;
    }
    return out;
  },
  format: v => {
    const pre = (v.match(/^[A-Z]+/) || [''])[0];
    const rest = v.slice(pre.length);
    return [pre, rest.slice(0, 3), rest.slice(3, 6)].filter(Boolean).join(' ');
  },
  complete: v => PLATE_RE.test(v),
};

// Nombre propio: mayúscula al inicio de cada palabra (refuerzo en JS de
// autoCapitalize="words", que algunos teclados/in-app browsers ignoran)
export const capWords = v => v.replace(/(^|\s)\p{Ll}/gu, m => m.toUpperCase());
