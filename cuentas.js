'use strict';

// Validación compartida del módulo de cuentas. Nunca almacena contraseñas sin hash.
const ROLES=Object.freeze(['administradora','auxiliar']);
function validarCuenta(input,{exigirPassword=false}={}){
  const nombre=String(input.nombre??'').trim();
  const usuario=String(input.usuario??'').trim().toLowerCase();
  const rol=String(input.rol??'');
  const password=String(input.password??'');
  if(nombre.length<2||nombre.length>100)return {error:'nombre_invalido'};
  if(!/^[a-z][a-z0-9._-]{2,31}$/.test(usuario))return {error:'usuario_invalido'};
  if(!ROLES.includes(rol))return {error:'rol_invalido'};
  if(exigirPassword&&!password)return {error:'clave_requerida'};
  if(password&&(password.length<12||password.length>128||password.trim().length<12))return {error:'clave_invalida'};
  return {nombre,usuario,rol,password};
}
module.exports={validarCuenta,ROLES};
