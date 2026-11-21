'use strict';

// La papelería usa un único horario diario de apertura y cierre, evaluado siempre
// en America/Mexico_City (independiente de la región donde esté el servidor Render).
const ZONA_HORARIA='America/Mexico_City';
const HORA_VALIDA=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const FORMATO_GUARDADO=/^(\d{2}:\d{2}) a (\d{2}:\d{2})$/;

function validarHorario(apertura,cierre){
  const a=String(apertura||'').trim(),c=String(cierre||'').trim();
  if(!HORA_VALIDA.test(a)||!HORA_VALIDA.test(c)||a===c)return null;
  return a+' a '+c;
}
function parseHorario(texto){
  const match=FORMATO_GUARDADO.exec(String(texto||'').trim());
  if(!match||!validarHorario(match[1],match[2]))return null;
  return {apertura:match[1],cierre:match[2]};
}
function minutos(hora){
  const [h,m]=hora.split(':').map(Number);
  return h*60+m;
}
function horaActualMX(fecha=new Date()){
  const parts=new Intl.DateTimeFormat('en-GB',{
    timeZone:ZONA_HORARIA,hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).formatToParts(fecha);
  const h=Number(parts.find(x=>x.type==='hour')?.value);
  const m=Number(parts.find(x=>x.type==='minute')?.value);
  if(!Number.isInteger(h)||!Number.isInteger(m))throw new Error('No se pudo leer la hora de México');
  return h*60+m;
}
// null = horario sin configurar o mal escrito. Se conserva el funcionamiento
// previo hasta que la administradora guarde horas válidas: no se inventa un turno.
function estaAbierto(horario,fecha=new Date()){
  const conf=parseHorario(horario);
  if(!conf)return null;
  const ahora=horaActualMX(fecha),inicio=minutos(conf.apertura),fin=minutos(conf.cierre);
  return inicio<fin ? ahora>=inicio&&ahora<fin : ahora>=inicio||ahora<fin;
}
function formato12(hora){
  const [h,m]=hora.split(':').map(Number);
  return (h%12||12)+':'+String(m).padStart(2,'0')+(h<12?' a. m.':' p. m.');
}
function horarioLegible(horario){
  const conf=parseHorario(horario);
  return conf ? formato12(conf.apertura)+' – '+formato12(conf.cierre) : 'Por confirmar';
}
module.exports={ZONA_HORARIA,validarHorario,parseHorario,horaActualMX,estaAbierto,horarioLegible};
