const path = require('node:path');

function targetError(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  return error;
}

function resolveDataTarget(target, currentPath) {
  if (typeof target !== 'string' || !target.trim()) throw targetError('DATA_TARGET_INVALID', '请选择有效的数据目录');
  if (typeof currentPath !== 'string' || !currentPath.trim()) throw targetError('DATA_TARGET_INVALID', '当前数据目录无效');
  const current = path.resolve(currentPath);
  const requested = path.resolve(target.trim());
  if (requested === path.parse(requested).root) throw targetError('DATA_TARGET_INVALID', '数据目录不能使用磁盘根目录');
  if (requested === current) throw targetError('DATA_TARGET_SAME', '目标数据目录与当前目录相同');
  const currentInsideTarget = path.relative(requested, current);
  const targetInsideCurrent = path.relative(current, requested);
  if (!currentInsideTarget.startsWith('..' + path.sep) && currentInsideTarget !== '..') throw targetError('DATA_TARGET_INVALID', '目标数据目录不能包含当前工作区');
  if (!targetInsideCurrent.startsWith('..' + path.sep) && targetInsideCurrent !== '..') throw targetError('DATA_TARGET_INVALID', '目标数据目录不能位于当前工作区内部');
  return requested;
}

module.exports = { resolveDataTarget };
