export const indicatorMeta = {
  revenue: { label: 'Faturamento', unit: 'BRL', group: 'Vendas e visitas' },
  orders: { label: 'Pedidos', unit: 'count', group: 'Vendas e visitas' },
  visits: { label: 'Visitas', unit: 'count', group: 'Vendas e visitas' },
  adSpend: { label: 'Investimento em publicidade', unit: 'BRL', group: 'Publicidade e custos' },
  attributedRevenue: { label: 'Receita atribuída à publicidade', unit: 'BRL', group: 'Publicidade e custos' },
  totalCosts: { label: 'Custos totais, incluindo publicidade', unit: 'BRL', group: 'Publicidade e custos' },
  claims: { label: 'Reclamações', unit: 'count', group: 'Qualidade da operação' },
  cancellations: { label: 'Cancelamentos', unit: 'count', group: 'Qualidade da operação' },
  lateShipments: { label: 'Envios em atraso', unit: 'count', group: 'Qualidade da operação' },
  skuCount: { label: 'SKUs no catálogo', unit: 'count', group: 'Estoque e anúncios' },
  outOfStockSkus: { label: 'SKUs sem estoque', unit: 'count', group: 'Estoque e anúncios' },
  activeListings: { label: 'Anúncios ativos', unit: 'count', group: 'Estoque e anúncios' },
  completeListings: { label: 'Anúncios completos', unit: 'count', group: 'Estoque e anúncios' },
  averageTicket: { label: 'Ticket médio', unit: 'BRL', group: 'Indicadores calculados' },
  conversionRate: { label: 'Taxa de conversão', unit: 'percent', group: 'Indicadores calculados' },
  roas: { label: 'ROAS', unit: 'ratio', group: 'Indicadores calculados' },
  acos: { label: 'ACOS', unit: 'percent', group: 'Indicadores calculados' },
  tacos: { label: 'TACOS', unit: 'percent', group: 'Indicadores calculados' },
  estimatedMargin: { label: 'Margem estimada', unit: 'percent', group: 'Indicadores calculados' },
} as const;
export type MetricKey = keyof typeof indicatorMeta;
export const rawMetricKeys = Object.keys(indicatorMeta).filter(key => indicatorMeta[key as MetricKey].group !== 'Indicadores calculados') as MetricKey[];
export function formatMetric(value: number | string | null | undefined, key: string) {
  if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return 'Não informado';
  const unit = indicatorMeta[key as MetricKey]?.unit;
  if (unit === 'BRL') return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(Number(value));
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: unit === 'count' ? 0 : 4 }).format(Number(value))}${unit === 'percent' ? '%' : unit === 'ratio' ? '×' : ''}`;
}
export function monthLabel(period: string, short = false) {
  if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(period)) return period;
  return new Intl.DateTimeFormat('pt-BR', { month: short ? 'short' : 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${period}-01T12:00:00Z`));
}

export function parseIndicatorDecimal(value: string, scale: number, label: string): string | null {
  const text = value.trim(); if (!text) return null;
  let normalized = text;
  if (text.includes(',')) {
    const brazilian = new RegExp('^(?:[0-9]+|[1-9][0-9]{0,2}(?:\\.[0-9]{3})+),[0-9]{1,' + scale + '}$');
    if (!brazilian.test(text)) throw new Error(label + ': confira os separadores. Use, por exemplo, 1.234,56 ou 1234,56.');
    normalized = text.replace(/\./g, '').replace(',', '.');
  } else {
    const simple = new RegExp('^[0-9]+(?:\\.[0-9]{1,' + scale + '})?$');
    if (!simple.test(text) || (scale >= 3 && /^[0-9]{1,3}\.[0-9]{3}$/.test(text))) throw new Error(label + ': use vírgula para casas decimais e evite separadores ambíguos.');
  }
  const number = Number(normalized);
  if (!Number.isFinite(number) || number > 1e12) throw new Error(label + ': o valor informado é muito alto.');
  return number.toFixed(scale);
}
type PreviewIssue = { field: string; message: string };
export function indicatorPreviewErrorsCsv(preview: { errors: PreviewIssue[]; rows: { line: number; period?: string; errors: PreviewIssue[] }[] }) {
  const fieldLabels: Record<string, string> = {
    file: 'Arquivo', headers: 'Cabeçalhos', columns: 'Colunas', header: 'Cabeçalho', period: 'Período', periodo: 'Período', periodStatus: 'Situação do mês', situacao: 'Situação do mês', sourceLabel: 'Origem e base', origem: 'Origem e base', notes: 'Observações', observacoes: 'Observações', basisConfirmed: 'Base confirmada', base_confirmada: 'Base confirmada', adsAttributionConfirmed: 'Atribuição confirmada', atribuicao_confirmada: 'Atribuição confirmada', costsComplete: 'Custos completos', custos_completos: 'Custos completos', values: 'Valores informados',
    faturamento: 'Faturamento', pedidos: 'Pedidos', visitas: 'Visitas', investimento_publicitario: 'Investimento em publicidade', vendas_atribuidas: 'Receita atribuída à publicidade', custos_totais: 'Custos totais', reclamacoes: 'Reclamações', cancelamentos: 'Cancelamentos', atrasos_envio: 'Envios em atraso', skus: 'SKUs no catálogo', skus_sem_estoque: 'SKUs sem estoque', anuncios_ativos: 'Anúncios ativos', anuncios_completos: 'Anúncios completos',
  };
  function label(field: string) { const key = field.replace(/^values\./, ''); return fieldLabels[key] || indicatorMeta[key as MetricKey]?.label || field || 'Arquivo'; }
  function cell(value: string | number) { let text = String(value); if (/^\s*[=+\-@]/u.test(text) || /[\u0000-\u001f\u007f]/.test(text)) text = `'${text}`; return `"${text.replace(/"/g, '""')}"`; }
  const rows: (string | number)[][] = [['Linha', 'Período', 'Campo', 'Mensagem']];
  for (const issue of preview.errors) rows.push(['Arquivo', '', label(issue.field), issue.message]);
  for (const row of preview.rows) for (const issue of row.errors) rows.push([row.line, row.period || '', label(issue.field), issue.message]);
  return '\uFEFF' + rows.map(row => row.map(cell).join(';')).join('\r\n') + '\r\n';
}
