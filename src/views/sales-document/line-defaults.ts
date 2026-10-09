import type { ScmDocumentLine, ScmMaterialOption } from '../../api/sales-document.types'

/** 来源明细优先，物料资料只补全缺失值；仓储位置仅使用已选中的库存信息。 */
export function fillScmLineDefaults(
  line: ScmDocumentLine,
  material?: ScmMaterialOption,
  deliveryDate?: string
): void {
  const baseUnit = material?.baseUnitName || material?.unit || ''
  line.specification ||= material?.specification || ''
  line.manufacturer ||= material?.manufacturer || ''
  line.brand ||= material?.brand || ''
  line.materialCategory ||= material?.materialCategory || ''
  line.materialType ||= material?.materialType || ''
  line.materialSource ||= material?.materialSource || ''
  line.baseUnit ||= baseUnit
  line.salesUnit ||= material?.salesUnit || baseUnit
  line.stockUnit ||= material?.stockUnit || baseUnit
  line.auxiliaryUnit ||= material?.auxiliaryUnit || ''
  line.auxiliaryUnit2 ||= material?.auxiliaryUnit2 || ''
  line.warehouse ||= line.warehouseName || ''
  line.location ||= line.binName || ''
  line.needDate ||= line.deliveryDate || deliveryDate || ''
}
