const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_AMOUNT = 100000;

function fail(msg) {
  return { valid: false, error: msg };
}

function validateAction(action, params) {
  switch (action) {

    case 'toggle-attendance': {
      if (!params.riderId || !UUID_RE.test(params.riderId)) return fail('Invalid rider ID');
      if (!params.date || !DATE_RE.test(params.date)) return fail('Invalid date');
      const d = new Date(params.date + 'T00:00:00+05:30');
      if (isNaN(d)) return fail('Invalid date');
      if (d.getUTCDay() === 0 && d.getUTCHours() < 19) return fail('Cannot mark attendance on Sunday');
      // More lenient: just check the date parses and isn't Sunday in IST
      break;
    }

    case 'bulk-attendance': {
      if (!params.date || !DATE_RE.test(params.date)) return fail('Invalid date');
      if (!Array.isArray(params.riderIds)) return fail('riderIds must be an array');
      for (const id of params.riderIds) {
        if (!UUID_RE.test(id)) return fail('Invalid rider ID in list');
      }
      if (typeof params.present !== 'boolean') return fail('present must be boolean');
      break;
    }

    case 'add-payment': {
      if (!params.riderId || !UUID_RE.test(params.riderId)) return fail('Invalid rider ID');
      if (!params.week || !DATE_RE.test(params.week)) return fail('Invalid week');
      if (!params.date || !DATE_RE.test(params.date)) return fail('Invalid payment date');
      if (typeof params.amount !== 'number' || params.amount <= 0) return fail('Amount must be greater than 0');
      if (params.amount > MAX_AMOUNT) return fail('Amount exceeds maximum (₹1,00,000)');
      if (!Number.isInteger(params.amount)) return fail('Amount must be a whole number');
      break;
    }

    case 'remove-payment': {
      if (!params.paymentId || !UUID_RE.test(params.paymentId)) return fail('Invalid payment ID');
      break;
    }

    case 'update-rider': {
      if (!params.riderId || !UUID_RE.test(params.riderId)) return fail('Invalid rider ID');
      if (!params.name || typeof params.name !== 'string') return fail('Name is required');
      const trimmed = params.name.trim();
      if (trimmed.length === 0 || trimmed.length > 50) return fail('Name must be 1–50 characters');
      break;
    }

    case 'update-rate': {
      if (!params.from || !DATE_RE.test(params.from)) return fail('Invalid from date');
      if (typeof params.rate !== 'number' || params.rate < 0) return fail('Rate must be ≥ 0');
      if (params.rate > MAX_AMOUNT) return fail('Rate exceeds maximum');
      if (!Number.isInteger(params.rate)) return fail('Rate must be a whole number');
      break;
    }

    default:
      return fail('Unknown action: ' + action);
  }

  return { valid: true };
}

module.exports = { validateAction };
