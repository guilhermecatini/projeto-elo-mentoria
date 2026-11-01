exports.up = async function (k) {
  // Repair installations that applied 007 before its regex stopped using Knex's '?' placeholders.
  // No rows are rewritten or removed. The range and metric-specific checks remain in place.
  await k.raw('ALTER TABLE indicator_goals DROP CONSTRAINT IF EXISTS indicator_goals_target_check');
  await k.raw("ALTER TABLE indicator_goals ADD CONSTRAINT indicator_goals_target_format_check CHECK (target ~ '^[-]{0,1}[0-9]+([.][0-9]{1,4}){0,1}$')");
};
exports.down = async function () {
  throw new Error('Não reinstale a validação antiga. Preserve os dados e aplique uma correção aditiva.');
};
