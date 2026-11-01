import {RAW_INDICATOR_KEYS,type IndicatorData,type RawIndicatorKey} from './indicator-math';

export const INDICATOR_CSV_VERSION=1;
export const INDICATOR_CSV_MAX_BYTES=64*1024;
export const INDICATOR_CSV_MAX_ROWS=200;
const valueColumns:Record<RawIndicatorKey,string>={revenue:'faturamento',orders:'pedidos',visits:'visitas',adSpend:'investimento_publicitario',attributedRevenue:'vendas_atribuidas',totalCosts:'custos_totais',claims:'reclamacoes',cancellations:'cancelamentos',lateShipments:'atrasos_envio',skuCount:'skus',outOfStockSkus:'skus_sem_estoque',activeListings:'anuncios_ativos',completeListings:'anuncios_completos'};
export const INDICATOR_CSV_COLUMNS=['periodo','situacao','origem','observacoes','base_confirmada','atribuicao_confirmada','custos_completos',...RAW_INDICATOR_KEYS.map(key=>valueColumns[key])];
export type CsvIssue={field:string;message:string};
export type IndicatorCsvRow={line:number;period?:string;data?:IndicatorData&{period:string};errors:CsvIssue[]};
export type IndicatorCsvPreview={version:1;columns:string[];rows:IndicatorCsvRow[];errors:CsvIssue[]};
const issue=(field:string,message:string):CsvIssue=>({field,message});
const moneyKeys=new Set<RawIndicatorKey>(['revenue','adSpend','attributedRevenue','totalCosts']);
function money(value:string){
  if(!/^\d+(?:[.,]\d{1,2})?$/.test(value))return null;
  const [whole,decimal='']=value.replace(',','.').split('.');
  return `${whole.replace(/^0+(?=\d)/,'')}.${decimal.padEnd(2,'0')}`;
}
function bool(value:string):boolean|null{
  if(['','não','nao','false','0'].includes(value.toLocaleLowerCase('pt-BR')))return false;
  if(['sim','true','1'].includes(value.toLocaleLowerCase('pt-BR')))return true;
  return null;
}

// Small, bounded RFC-style reader: quoted separators/newlines and doubled quotes are data, never commands.
function records(text:string):{records:{line:number;cells:string[]}[];error?:CsvIssue}{
  const result:{line:number;cells:string[]}[]=[];
  let cells:string[]=[],field='',quoted=false,afterQuote=false,line=1,startLine=1;
  function pushField(){cells.push(field);field='';afterQuote=false;}
  function pushRecord(){pushField();if(cells.some(cell=>cell.trim()!==''))result.push({line:startLine,cells});cells=[];startLine=line+1;}
  for(let i=0;i<text.length;i++){
    const char=text[i];
    if(quoted){
      if(char==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;afterQuote=true;}}
      else if(char==='\r'||char==='\n'){if(char==='\r'&&text[i+1]==='\n')i++;field+='\n';line++;}
      else field+=char;
      continue;
    }
    if(char===';'){pushField();continue;}
    if(char==='\r'||char==='\n'){if(char==='\r'&&text[i+1]==='\n')i++;pushRecord();line++;if(result.length>INDICATOR_CSV_MAX_ROWS+1)return {records:[],error:issue('file','A prévia aceita até 200 registros. Divida o arquivo em partes menores.')};continue;}
    if(afterQuote){if(char===' '||char==='\t')continue;return {records:[],error:issue('file',`Há texto após o fechamento de aspas na linha ${line}. Use o modelo de arquivo.`)};}
    if(char==='"'){if(field.length)return {records:[],error:issue('file',`As aspas da linha ${line} precisam envolver o campo completo.`)};quoted=true;continue;}
    field+=char;
  }
  if(quoted)return {records:[],error:issue('file',`Há aspas sem fechamento a partir da linha ${startLine}.`)};
  if(field.length||cells.length||afterQuote)pushRecord();
  return {records:result};
}

export function parseIndicatorCsv(input:string):IndicatorCsvPreview{
  const result:IndicatorCsvPreview={version:1,columns:[],rows:[],errors:[]};
  if(Buffer.byteLength(input,'utf8')>INDICATOR_CSV_MAX_BYTES){result.errors.push(issue('file','O arquivo está muito grande para esta prévia. Divida-o em partes menores.'));return result;}
  if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/.test(input)){result.errors.push(issue('file','O arquivo precisa conter texto CSV em UTF-8, sem caracteres inválidos.'));return result;}
  const parsed=records(input.replace(/^\uFEFF/,''));
  if(parsed.error){result.errors.push(parsed.error);return result;}
  if(!parsed.records.length){result.errors.push(issue('file','O arquivo está vazio. Use o modelo para preencher os indicadores.'));return result;}
  if(parsed.records.length-1>INDICATOR_CSV_MAX_ROWS){result.errors.push(issue('file','A prévia aceita até 200 registros. Divida o arquivo em partes menores.'));return result;}
  const header=parsed.records[0].cells.map(value=>value.trim().toLocaleLowerCase('pt-BR'));
  result.columns=header;
  if(header.length===1&&header[0].includes(',')){result.errors.push(issue('header','Use ponto e vírgula para separar as colunas, conforme o modelo.'));return result;}
  if(new Set(header).size!==header.length)result.errors.push(issue('header','O cabeçalho possui colunas repetidas.'));
  for(const name of header)if(!INDICATOR_CSV_COLUMNS.includes(name))result.errors.push(issue('header',`Coluna não reconhecida: ${name||'(sem nome)'}. Use os nomes do modelo.`));
  for(const name of ['periodo','situacao','origem'])if(!header.includes(name))result.errors.push(issue('header',`Inclua a coluna obrigatória ${name}.`));
  if(result.errors.length)return result;
  if(parsed.records.length===1){result.errors.push(issue('file','Inclua ao menos uma linha de resultados após o cabeçalho.'));return result;}
  const periods=new Map<string,number>();
  for(const record of parsed.records.slice(1)){
    const row:IndicatorCsvRow={line:record.line,period:record.cells[header.indexOf('periodo')]?.trim(),errors:[]};
    if(record.cells.length!==header.length){row.errors.push(issue('row','A quantidade de campos difere do cabeçalho. Confira separadores e aspas.'));result.rows.push(row);continue;}
    const fields=Object.fromEntries(header.map((name,index)=>[name,record.cells[index].trim()]));
    const period=fields.periodo;
    row.period=period;
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))row.errors.push(issue('period','Informe o período como AAAA-MM.'));
    else if(periods.has(period))row.errors.push(issue('period',`Este período já aparece na linha ${periods.get(period)}.`));
    else periods.set(period,record.line);
    const periodStatus=fields.situacao?.toLocaleLowerCase('pt-BR');
    if(!['parcial','fechado'].includes(periodStatus))row.errors.push(issue('periodStatus','A situação deve ser parcial ou fechado.'));
    if(!fields.origem)row.errors.push(issue('sourceLabel','Informe a origem estável dos dados deste período.'));
    const flags:Record<string,boolean>={};
    for(const [column,key]of [['base_confirmada','basisConfirmed'],['atribuicao_confirmada','adsAttributionConfirmed'],['custos_completos','costsComplete']]){
      const value=bool(fields[column]||'');if(value===null)row.errors.push(issue(key,'Use sim ou não para esta confirmação.'));else flags[key]=value;
    }
    const values={} as IndicatorData['values'];
    for(const key of RAW_INDICATOR_KEYS){
      const value=fields[valueColumns[key]]||'';
      if(!value){values[key]=null;continue;}
      if(moneyKeys.has(key)){
        const parsedMoney=money(value);if(parsedMoney===null){row.errors.push(issue(`values.${key}`,'Use um valor não negativo, sem separador de milhar e com até duas casas decimais.'));values[key]=null;}else values[key]=parsedMoney;
      }else if(!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value))){row.errors.push(issue(`values.${key}`,'Use uma quantidade inteira não negativa, sem separador de milhar.'));values[key]=null;}
      else values[key]=Number(value);
    }
    row.data={period,periodStatus:periodStatus==='fechado'?'closed':'partial',sourceLabel:fields.origem,notes:fields.observacoes||'',
      basisConfirmed:flags.basisConfirmed??false,adsAttributionConfirmed:flags.adsAttributionConfirmed??false,costsComplete:flags.costsComplete??false,values};
    result.rows.push(row);
  }
  return result;
}
export function indicatorCsvTemplate(period:string){
  const values:Record<string,string>={periodo:period,situacao:'parcial',origem:'Relatório consolidado da empresa',observacoes:'Exemplo: substitua pelos seus dados antes de validar.',
    base_confirmada:'sim',atribuicao_confirmada:'sim',custos_completos:'sim',faturamento:'1000,00',pedidos:'10',visitas:'100',investimento_publicitario:'100,00',vendas_atribuidas:'600,00',custos_totais:'800,00'};
  return '\uFEFF'+INDICATOR_CSV_COLUMNS.join(';')+'\r\n'+INDICATOR_CSV_COLUMNS.map(key=>values[key]||'').join(';')+'\r\n';
}
