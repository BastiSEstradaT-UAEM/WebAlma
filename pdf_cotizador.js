'use strict';
// Analiza estructura, páginas y tamaños; NO realiza OCR ni identifica tinta de color.
const MAX_BYTES=8*1024*1024;
const MAX_PAGES=200;
function detectarFormato(w,h){
  const [a,b]=[Math.min(w,h),Math.max(w,h)];
  const cerca=(x,y)=>Math.abs(x-y)<10;
  if(cerca(a,612)&&cerca(b,792))return 'Carta';
  if(cerca(a,595)&&cerca(b,842))return 'A4';
  if(cerca(a,612)&&cerca(b,1008))return 'Oficio';
  return 'Otro';
}
async function analizarPDF(bytes){
  if(!Buffer.isBuffer(bytes)||bytes.length<10||bytes.length>MAX_BYTES)throw new Error('TAMANO_PDF');
  if(!bytes.subarray(0,1024).toString('latin1').includes('%PDF-'))throw new Error('FORMATO_PDF');
  const {PDFDocument}=require('pdf-lib');
  let doc;
  try{doc=await PDFDocument.load(bytes,{updateMetadata:false});}
  catch(_e){throw new Error('PDF_DANADO_O_PROTEGIDO');}
  const paginas=doc.getPageCount();
  if(paginas<1||paginas>MAX_PAGES)throw new Error('PAGINAS_FUERA_DE_RANGO');
  const formatos=new Set(doc.getPages().map(p=>{const s=p.getSize();return detectarFormato(s.width,s.height);}));
  return {paginas,formato:formatos.size===1?[...formatos][0]:'Mixto'};
}
async function descargarPDFTelegram(bot,fileId){
  const fileUrl=await bot.telegram.getFileLink(fileId);
  const u=new URL(String(fileUrl));
  if(u.protocol!=='https:'||u.hostname!=='api.telegram.org')throw new Error('URL_ARCHIVO_INVALIDA');
  const res=await fetch(u,{signal:AbortSignal.timeout(25000),redirect:'error'});
  if(!res.ok||!res.body)throw new Error('DESCARGA_FALLIDA');
  if(Number(res.headers.get('content-length')||0)>MAX_BYTES)throw new Error('TAMANO_PDF');
  const reader=res.body.getReader();let size=0;const chunks=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;
    if(size>MAX_BYTES)throw new Error('TAMANO_PDF');chunks.push(Buffer.from(value));}}
  finally{await reader.cancel().catch(()=>{});}
  return Buffer.concat(chunks,size);
}
function cotizarPDF({paginas,copias,tipo,dobleCara},cfg){
  if(!Number.isSafeInteger(paginas)||paginas<1||paginas>MAX_PAGES)throw new Error('PAGINAS_INVALIDAS');
  if(!Number.isSafeInteger(copias)||copias<1||copias>30)throw new Error('COPIAS_INVALIDAS');
  if(!['bn','color'].includes(tipo))throw new Error('TIPO_INVALIDO');
  const impresiones=paginas*copias;
  const hojas=(dobleCara?Math.ceil(paginas/2):paginas)*copias;
  const unit=Number(tipo==='bn'?cfg.precioBN:cfg.precioColor);
  if(!Number.isFinite(unit)||unit<0)throw new Error('TARIFA_INVALIDA');
  return {paginas,copias,impresiones,hojas,tipo,dobleCara:!!dobleCara,
    precioUnitario:unit,total:Math.round(impresiones*unit*100)/100};
}
module.exports={analizarPDF,descargarPDFTelegram,cotizarPDF,MAX_BYTES,MAX_PAGES};
