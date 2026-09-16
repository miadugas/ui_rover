/**
 * Analytics dashboard: topbar, sidebar menu, stat tiles, chart area (bars +
 * a line as shapes), table rows. One `web` frame (plan §9).
 */
import type { BlockSpec, FrameSpec, FrameVariant, MockTemplate, SectionSpec } from '../spec'
import type { Role } from '../../../../types'

const TEMPLATE_ID = 'dashboard'

type BlockBody = Omit<BlockSpec, 'renderKey' | 'overrideKey'>

function block(variant: FrameVariant, overrideKey: string, body: BlockBody): BlockSpec {
  const element = overrideKey.slice(TEMPLATE_ID.length + 1)
  return { renderKey: `${TEMPLATE_ID}.${variant}.${element}`, overrideKey, ...body }
}

const SIDEBAR_SLOTS = [1, 2, 3, 4, 5]
const STAT_SLOTS = [1, 2, 3, 4]
const CHART_BAR_SLOTS = [1, 2, 3, 4, 5]
const ROW_SLOTS = [1, 2, 3, 4]

function topbarSection(variant: FrameVariant): SectionSpec {
  return {
    key: 'topbar',
    label: 'Topbar',
    columns: 4,
    blocks: [
      block(variant, 'dashboard.topbar.logo', {
        role: 'text',
        shape: 'bar',
        span: 1,
        height: 'md',
        width: 'full',
        label: 'logo',
      }),
      block(variant, 'dashboard.topbar.search', {
        role: 'surface',
        shape: 'bar',
        span: 2,
        height: 'md',
        width: 'full',
        label: 'search bar',
      }),
      block(variant, 'dashboard.topbar.avatar', {
        role: 'accent',
        shape: 'dot',
        span: 1,
        label: 'avatar',
      }),
    ],
  }
}

function sidebarSection(variant: FrameVariant): SectionSpec {
  return {
    key: 'sidebar',
    label: 'Sidebar',
    columns: 1,
    blocks: [
      block(variant, 'dashboard.sidebar.box', {
        role: 'surface',
        shape: 'box',
        span: 1,
        height: 'xl',
        width: 'full',
        label: 'sidebar panel',
      }),
      ...SIDEBAR_SLOTS.map((slot) =>
        block(variant, `dashboard.sidebar.item-${slot}`, {
          role: 'muted',
          shape: 'bar',
          span: 1,
          height: 'sm',
          width: 'full',
          label: `sidebar item ${slot}`,
        }),
      ),
    ],
  }
}

function statsSection(variant: FrameVariant): SectionSpec {
  return {
    key: 'stats',
    label: 'Stats',
    columns: 4,
    blocks: STAT_SLOTS.flatMap((slot) => [
      block(variant, `dashboard.stats.tile-${slot}.box`, {
        role: 'surface',
        shape: 'box',
        span: 1,
        height: 'md',
        width: 'full',
        label: `stat tile ${slot}`,
      }),
      block(variant, `dashboard.stats.tile-${slot}.value`, {
        role: 'text',
        shape: 'bar',
        span: 1,
        height: 'sm',
        width: 'half',
        label: `stat ${slot} value`,
      }),
      block(variant, `dashboard.stats.tile-${slot}.label`, {
        role: 'muted',
        shape: 'bar',
        span: 1,
        height: 'xs',
        width: 'half',
        label: `stat ${slot} label`,
      }),
    ]),
  }
}

function chartSection(variant: FrameVariant): SectionSpec {
  return {
    key: 'chart',
    label: 'Chart',
    columns: 6,
    blocks: [
      block(variant, 'dashboard.chart.box', {
        role: 'surface',
        shape: 'box',
        span: 6,
        height: 'xl',
        width: 'full',
        label: 'chart area',
      }),
      ...CHART_BAR_SLOTS.map((slot) => {
        const role: Role = slot % 2 === 0 ? 'accent' : 'primary'
        return block(variant, `dashboard.chart.bar-${slot}`, {
          role,
          shape: 'bar',
          span: 1,
          height: 'lg',
          width: 'auto',
          label: `chart bar ${slot}`,
        })
      }),
      block(variant, 'dashboard.chart.line', {
        role: 'accent',
        shape: 'bar',
        span: 1,
        height: 'xs',
        width: 'full',
        label: 'chart trend line',
      }),
    ],
  }
}

function tableSection(variant: FrameVariant): SectionSpec {
  return {
    key: 'table',
    label: 'Table',
    columns: 1,
    blocks: [
      block(variant, 'dashboard.table.header', {
        role: 'surface',
        shape: 'bar',
        span: 1,
        height: 'sm',
        width: 'full',
        label: 'table header',
      }),
      ...ROW_SLOTS.map((slot) =>
        block(variant, `dashboard.table.row-${slot}`, {
          role: 'muted',
          shape: 'bar',
          span: 1,
          height: 'sm',
          width: 'full',
          label: `table row ${slot}`,
        }),
      ),
    ],
  }
}

function frame(variant: FrameVariant): FrameSpec {
  return {
    variant,
    backgroundRole: 'background',
    sections: [
      topbarSection(variant),
      sidebarSection(variant),
      statsSection(variant),
      chartSection(variant),
      tableSection(variant),
    ],
  }
}

export const dashboardTemplate: MockTemplate = {
  id: 'dashboard',
  label: 'Dashboard',
  frames: [frame('web')],
}
