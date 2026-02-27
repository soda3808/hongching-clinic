// ══════════════════════════════════
// FHIR R4 Data Conversion Utilities
// Converts internal clinic data to HL7 FHIR R4 resources
// For eHRSS (醫健通) interoperability
// ══════════════════════════════════

import { getClinicName, getClinicNameEn, getTenantSlug } from '../tenant';

const SYSTEM_BASE = 'https://ehealth.gov.hk/fhir';

// ── Helper: Generate a FHIR-style UUID ──
function fhirId(prefix, id) {
  return `${prefix}-${id}`;
}

// ── Patient Resource ──
export function toFHIRPatient(patient) {
  return {
    resourceType: 'Patient',
    id: fhirId('patient', patient.id),
    meta: { profile: [`${SYSTEM_BASE}/StructureDefinition/hk-patient`] },
    identifier: [
      ...(patient.hkid ? [{
        system: `${SYSTEM_BASE}/sid/hkid`,
        value: patient.hkid,
      }] : []),
      { system: `${SYSTEM_BASE}/sid/clinic/${getTenantSlug()}`, value: patient.id },
    ],
    name: [{
      use: 'official',
      text: patient.name,
      family: patient.name?.charAt(0) || '',
      given: [patient.name?.substring(1) || ''],
    }],
    gender: patient.gender === '男' ? 'male' : patient.gender === '女' ? 'female' : 'unknown',
    birthDate: patient.dob || undefined,
    telecom: patient.phone ? [{ system: 'phone', value: patient.phone, use: 'mobile' }] : [],
    address: patient.address ? [{ text: patient.address, city: 'Hong Kong', country: 'HK' }] : [],
  };
}

// ── Encounter Resource (Consultation Visit) ──
export function toFHIREncounter(consultation, patient) {
  return {
    resourceType: 'Encounter',
    id: fhirId('encounter', consultation.id),
    status: 'finished',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' },
    type: [{
      coding: [{ system: `${SYSTEM_BASE}/CodeSystem/encounter-type`, code: 'cm-consult', display: '中醫診症' }],
      text: consultation.type || '診症',
    }],
    subject: { reference: `Patient/${fhirId('patient', patient?.id || consultation.patientId)}` },
    participant: consultation.doctor ? [{
      individual: { display: consultation.doctor },
      type: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType', code: 'PPRF' }] }],
    }] : [],
    period: {
      start: consultation.date ? `${consultation.date}T${consultation.time || '00:00'}:00+08:00` : undefined,
    },
    serviceProvider: { display: getClinicName() },
  };
}

// ── Condition Resource (CM Diagnosis) ──
export function toFHIRCondition(consultation, diagCode, zhengCode) {
  const coding = [];
  if (diagCode) {
    coding.push({ system: `${SYSTEM_BASE}/CodeSystem/cm-diagnosis`, code: diagCode, display: consultation.cmDiagnosis });
  }
  if (consultation.icd10) {
    coding.push({ system: 'http://hl7.org/fhir/sid/icd-10', code: consultation.icd10, display: consultation.cmDiagnosis });
  }

  return {
    resourceType: 'Condition',
    id: fhirId('condition', consultation.id),
    clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] },
    category: [{
      coding: [{ system: `${SYSTEM_BASE}/CodeSystem/condition-category`, code: 'cm-diagnosis', display: '中醫診斷' }],
    }],
    code: { coding, text: consultation.cmDiagnosis || consultation.diagnosis || '' },
    subject: { reference: `Patient/${fhirId('patient', consultation.patientId)}` },
    encounter: { reference: `Encounter/${fhirId('encounter', consultation.id)}` },
    recordedDate: consultation.date,
    note: [
      ...(consultation.cmPattern ? [{ text: `證型: ${consultation.cmPattern}` }] : []),
      ...(zhengCode ? [{ text: `證型代碼: ${zhengCode}` }] : []),
      ...(consultation.tongue ? [{ text: `舌象: ${consultation.tongue}` }] : []),
      ...(consultation.pulse ? [{ text: `脈象: ${consultation.pulse}` }] : []),
    ],
  };
}

// ── MedicationRequest Resource (CM Prescription) ──
export function toFHIRMedicationRequest(consultation, herbs) {
  if (!herbs?.length) return null;

  return {
    resourceType: 'MedicationRequest',
    id: fhirId('medrx', consultation.id),
    status: 'completed',
    intent: 'order',
    category: [{
      coding: [{ system: `${SYSTEM_BASE}/CodeSystem/medication-category`, code: 'cm-herbal', display: '中藥處方' }],
    }],
    medicationCodeableConcept: {
      text: herbs.map(h => `${h.herb || h.name} ${h.dosage || h.dose || ''}g`).join(', '),
    },
    subject: { reference: `Patient/${fhirId('patient', consultation.patientId)}` },
    encounter: { reference: `Encounter/${fhirId('encounter', consultation.id)}` },
    authoredOn: consultation.date,
    requester: { display: consultation.doctor },
    dosageInstruction: [{
      text: consultation.instructions || '每日一劑，水煎服',
      timing: { repeat: { frequency: consultation.frequency || 1, period: 1, periodUnit: 'd' } },
    }],
    note: herbs.map(h => ({
      text: `${h.herb || h.name}: ${h.dosage || h.dose || ''}g${h.processing ? ` (${h.processing})` : ''}`,
    })),
  };
}

// ── Procedure Resource (CM Treatment) ──
export function toFHIRProcedure(consultation, treatment) {
  return {
    resourceType: 'Procedure',
    id: fhirId('procedure', `${consultation.id}-${treatment.code || treatment.name}`),
    status: 'completed',
    category: {
      coding: [{ system: `${SYSTEM_BASE}/CodeSystem/procedure-category`, code: 'cm-procedure', display: '中醫治療' }],
    },
    code: {
      coding: treatment.code ? [{ system: `${SYSTEM_BASE}/CodeSystem/cm-procedure`, code: treatment.code, display: treatment.name }] : [],
      text: treatment.name,
    },
    subject: { reference: `Patient/${fhirId('patient', consultation.patientId)}` },
    encounter: { reference: `Encounter/${fhirId('encounter', consultation.id)}` },
    performedDateTime: consultation.date ? `${consultation.date}T${consultation.time || '00:00'}:00+08:00` : undefined,
    performer: [{ actor: { display: consultation.doctor } }],
    note: treatment.points ? [{ text: `穴位: ${treatment.points}` }] : [],
  };
}

// ── AllergyIntolerance Resource ──
export function toFHIRAllergy(patient, allergyText) {
  return {
    resourceType: 'AllergyIntolerance',
    id: fhirId('allergy', `${patient.id}-${Date.now()}`),
    clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: 'active' }] },
    type: 'allergy',
    patient: { reference: `Patient/${fhirId('patient', patient.id)}` },
    recordedDate: new Date().toISOString().substring(0, 10),
    note: [{ text: allergyText }],
  };
}

// ── Bundle: Full Patient Record Export ──
export function toFHIRBundle(patient, consultations = [], type = 'collection') {
  const entries = [];

  // Patient
  entries.push({ resource: toFHIRPatient(patient), request: { method: 'PUT', url: `Patient/${fhirId('patient', patient.id)}` } });

  // Allergies
  if (patient.allergies && patient.allergies !== '無' && patient.allergies !== 'None') {
    entries.push({ resource: toFHIRAllergy(patient, patient.allergies) });
  }

  // Consultations → Encounter + Condition + MedicationRequest + Procedures
  for (const c of consultations) {
    entries.push({ resource: toFHIREncounter(c, patient) });

    if (c.cmDiagnosis || c.diagnosis) {
      entries.push({ resource: toFHIRCondition(c, c.cmDiagnosisCode, c.cmZhengCode) });
    }

    const herbs = c.prescription || c.herbs || [];
    const medRx = toFHIRMedicationRequest(c, herbs);
    if (medRx) entries.push({ resource: medRx });

    const treatments = c.treatments || [];
    for (const t of treatments) {
      entries.push({ resource: toFHIRProcedure(c, t) });
    }
  }

  return {
    resourceType: 'Bundle',
    type,
    timestamp: new Date().toISOString(),
    meta: {
      profile: [`${SYSTEM_BASE}/StructureDefinition/hk-ehealth-bundle`],
      tag: [{ system: `${SYSTEM_BASE}/CodeSystem/data-source`, code: getTenantSlug(), display: getClinicName() }],
    },
    entry: entries.map(e => ({
      fullUrl: e.resource.id ? `urn:uuid:${e.resource.id}` : undefined,
      resource: e.resource,
      ...(e.request ? { request: e.request } : {}),
    })),
    total: entries.length,
  };
}

// ── Export as JSON string ──
export function exportFHIRJSON(bundle) {
  return JSON.stringify(bundle, null, 2);
}

// ── Validate FHIR Resource (basic) ──
export function validateFHIRResource(resource) {
  const errors = [];
  if (!resource.resourceType) errors.push('Missing resourceType');
  if (!resource.id) errors.push('Missing id');
  if (resource.resourceType === 'Patient' && !resource.name?.length) errors.push('Patient missing name');
  if (resource.resourceType === 'Encounter' && !resource.subject) errors.push('Encounter missing subject');
  return { valid: errors.length === 0, errors };
}
