'use strict';
const assert=require('node:assert/strict');
const {ZONA_HORARIA,validarHorario,parseHorario,estaAbierto,horaActualMX,horarioLegible}=require('../horario_atencion');
assert.equal(ZONA_HORARIA,'America/Mexico_City');
assert.equal(validarHorario('06:00','19:00'),'06:00 a 19:00');
assert.equal(validarHorario('22:00','06:00'),'22:00 a 06:00');
assert.equal(validarHorario('06:00','06:00'),null);
assert.equal(validarHorario('0:600am','19:00pm'),null);
assert.equal(validarHorario('24:00','19:00'),null);
assert.equal(validarHorario('06:60','19:00'),null);
assert.deepEqual(parseHorario('06:00 a 19:00'),{apertura:'06:00',cierre:'19:00'});
assert.equal(parseHorario('0:600am a 19:00pm'),null);
assert.equal(horarioLegible('06:00 a 19:00'),'6:00 a. m. – 7:00 p. m.');
assert.equal(horarioLegible('horario mal escrito'),'Por confirmar');
// 2026-11-20 12:00 UTC = 06:00 en Ciudad de México.
const mx=utc=>new Date(utc);
assert.equal(horaActualMX(mx('2026-11-20T12:00:00Z')),360);
assert.equal(estaAbierto('06:00 a 19:00',mx('2026-11-20T11:59:00Z')),false);
assert.equal(estaAbierto('06:00 a 19:00',mx('2026-11-20T12:00:00Z')),true);
assert.equal(estaAbierto('06:00 a 19:00',mx('2026-11-21T00:59:00Z')),true);
assert.equal(estaAbierto('06:00 a 19:00',mx('2026-11-21T01:00:00Z')),false);
// El horario que cruza medianoche también respeta sus límites.
assert.equal(estaAbierto('22:00 a 06:00',mx('2026-11-21T04:30:00Z')),true);
assert.equal(estaAbierto('22:00 a 06:00',mx('2026-11-21T11:59:00Z')),true);
assert.equal(estaAbierto('22:00 a 06:00',mx('2026-11-21T12:00:00Z')),false);
assert.equal(estaAbierto('22:00 a 06:00',mx('2026-11-20T19:00:00Z')),false);
// Sin horario válido, no se imponen horarios adivinados.
assert.equal(estaAbierto('0:600am a 19:00pm',mx('2026-11-21T02:00:00Z')),null);
console.log('Horario: formatos, límites, madrugada y hora de México OK.');
