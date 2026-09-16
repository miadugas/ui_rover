/**
 * Component sheet: button row, input, card, nav bar, chips, a `code` block,
 * table. One `sheet` frame (plan §9) — not a page layout, a swatch of
 * reusable pieces.
 */
import type { BlockSpec, FrameSpec, FrameVariant, MockTemplate, SectionSpec } from '../spec'

const TEMPLATE_ID = 'components'

type BlockBody = Omit<BlockSpec, 'renderKey' | 'overrideKey'>

function block(variant: FrameVariant, overrideKey: string, body: BlockBody): BlockSpec {
  const element = overrideKey.slice(TEMPLATE_ID.length + 1)
  return { renderKey: `${TEMPLATE_ID}.${variant}.${element}`, overrideKey, ...body }
}

const NAV_LINK_SLOTS = [1, 2, 3, 4]
const CHIP_SLOTS = [1, 2, 3]
const TABLE_ROW_SLOTS = [1, 2, 3]

function buttonsSection(variant: FrameVariant): SectionSpec {
  return {
    key: 'buttons',
    label: 'Buttons',
    columns: 4,
    blocks: [
      block(variant, 'components.buttons.primary', {
        role: 'primary',
        shape: 'pill',
        span: 1,
        height: 'md',
        width: 'full',
        label: 'primary button',
      }),
      block(variant, 'components.buttons.secondary', {
        role: 'surface',
        shape: 'pill',
        span: 1,
        height: 'md',
        width: 'full',
        label: 'secondary button',
      }),
      block(variant, 'components.buttons.ghost', {
        role: 'muted',
        shape: 'pill',
        span: 1,
        height: 'md',
        width: 'full',
        label: 'ghost button',
      }),
      block(variant, 'components.buttons.disabled', {
        role: 'muted',
        shape: 'pill',
        span: 1,
        height: 'md',
        width: 'full',
        label: 'disabled button',
      }),
    ],
  }
}

function inputSection(variant: FrameVariant): SectionSpec {
  return {
    key: 'input',
    label: 'Input',
    columns: 1,
    blocks: [
      block(variant, 'components.input.label', {
        role: 'muted',
        shape: 'bar',
        span: 1,
        height: 'xs',
        width: 'third',
        label: 'input label',
      }),
      block(variant, 'components.input.field', {
        role: 'surface',
        shape: 'bar',
        span: 1,
        height: 'md',
        width: 'full',
        label: 'input field',
      }),
      block(variant, 'components.input.helper', {
        role: 'muted',
        shape: 'text',
        span: 1,
        width: 'half',
        label: 'helper text',
      }),
    ],
  }
}

function cardSection(variant: FrameVariant): SectionSpec {
  return {
    key: 'card',
    label: 'Card',
    columns: 1,
    blocks: [
      block(variant, 'components.card.image', {
        role: 'surface',
        shape: 'box',
        span: 1,
        height: 'lg',
        width: 'full',
        label: 'card image',
      }),
      block(variant, 'components.card.title', {
        role: 'text',
        shape: 'bar',
        span: 1,
        height: 'sm',
        width: 'full',
        label: 'card title',
      }),
      block(variant, 'components.card.price', {
        role: 'muted',
        shape: 'bar',
        span: 1,
        height: 'xs',
        width: 'half',
        label: 'card price',
      }),
      block(variant, 'components.card.cta', {
        role: 'primary',
        shape: 'pill',
        span: 1,
        height: 'md',
        width: 'full',
        label: 'card CTA',
      }),
    ],
  }
}

function navSection(variant: FrameVariant): SectionSpec {
  return {
    key: 'nav',
    label: 'Nav',
    columns: 6,
    blocks: [
      block(variant, 'components.nav.bar', {
        role: 'surface',
        shape: 'bar',
        span: 6,
        height: 'sm',
        width: 'full',
        label: 'nav bar',
      }),
      ...NAV_LINK_SLOTS.map((slot) =>
        block(variant, `components.nav.link-${slot}`, {
          role: 'muted',
          shape: 'bar',
          span: 1,
          height: 'xs',
          width: 'full',
          label: `nav link ${slot}`,
        }),
      ),
      block(variant, 'components.nav.active', {
        role: 'primary',
        shape: 'pill',
        span: 2,
        height: 'sm',
        width: 'full',
        label: 'active nav item',
      }),
    ],
  }
}

function chipsSection(variant: FrameVariant): SectionSpec {
  return {
    key: 'chips',
    label: 'Chips',
    columns: 4,
    blocks: [
      ...CHIP_SLOTS.map((slot) =>
        block(variant, `components.chips.chip-${slot}`, {
          role: 'surface',
          shape: 'pill',
          span: 1,
          height: 'sm',
          width: 'full',
          label: `chip ${slot}`,
        }),
      ),
      block(variant, 'components.chips.chip-accent', {
        role: 'accent',
        shape: 'pill',
        span: 1,
        height: 'sm',
        width: 'full',
        label: 'accent chip',
      }),
    ],
  }
}

function codeSection(variant: FrameVariant): SectionSpec {
  return {
    key: 'code',
    label: 'Code block',
    columns: 1,
    blocks: [
      block(variant, 'components.code.block', {
        role: 'surface',
        shape: 'code',
        span: 1,
        height: 'lg',
        width: 'full',
        label: 'code sample',
      }),
    ],
  }
}

function tableSection(variant: FrameVariant): SectionSpec {
  return {
    key: 'table',
    label: 'Table',
    columns: 4,
    blocks: [
      block(variant, 'components.table.header', {
        role: 'surface',
        shape: 'bar',
        span: 4,
        height: 'sm',
        width: 'full',
        label: 'table header',
      }),
      ...TABLE_ROW_SLOTS.map((slot) =>
        block(variant, `components.table.row-${slot}`, {
          role: 'muted',
          shape: 'bar',
          span: 3,
          height: 'sm',
          width: 'full',
          label: `table row ${slot}`,
        }),
      ),
      ...TABLE_ROW_SLOTS.map((slot) =>
        block(variant, `components.table.cell-dot-${slot}`, {
          role: 'accent',
          shape: 'dot',
          span: 1,
          label: `table row ${slot} status`,
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
      buttonsSection(variant),
      inputSection(variant),
      cardSection(variant),
      navSection(variant),
      chipsSection(variant),
      codeSection(variant),
      tableSection(variant),
    ],
  }
}

export const componentsTemplate: MockTemplate = {
  id: 'components',
  label: 'Components',
  frames: [frame('sheet')],
}
