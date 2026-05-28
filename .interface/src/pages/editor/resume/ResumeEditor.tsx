import { createElement, useEffect, useRef, useState } from "react"
import { KEYS, type SlateEditor, type TElement, type Value } from "platejs"
import {
  BlockquotePlugin,
  BoldPlugin,
  H1Plugin,
  H2Plugin,
  H3Plugin,
  H4Plugin,
  H5Plugin,
  H6Plugin,
  HorizontalRulePlugin,
  ItalicPlugin,
  UnderlinePlugin,
} from "@platejs/basic-nodes/react"
import {
  FontBackgroundColorPlugin,
  FontColorPlugin,
  FontSizePlugin,
  LineHeightPlugin,
  TextAlignPlugin,
} from "@platejs/basic-styles/react"
import { IndentPlugin } from "@platejs/indent/react"
import { indentList, isOrderedList, outdentList, toggleList } from "@platejs/list"
import {
  ListPlugin,
  useTodoListElement,
  useTodoListElementState,
} from "@platejs/list/react"
import { LinkPlugin, triggerFloatingLinkInsert } from "@platejs/link/react"
import { TogglePlugin, openNextToggles } from "@platejs/toggle/react"
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowDownAZ,
  Bold,
  Download,
  Highlighter,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListChecks,
  ListCollapse,
  ListOrdered,
  Minus,
  PaintBucket,
  Palette,
  Plus,
  Redo2,
  RotateCcw,
  Rows3,
  SeparatorHorizontal,
  Underline,
  Undo2,
  Upload,
} from "lucide-react"
import {
  Plate,
  PlateContent,
  PlateElement,
  useEditorSelector,
  usePlateEditor,
  type PlateElementProps,
} from "platejs/react"

import {
  defaultResumeEditorSettings,
  fetchResumeEditorSettings,
  saveResumeEditorSettings,
  type ResumeEditorSettings,
  type ResumeTextAlign,
} from "./resumeApi"

const STORAGE_KEY = "jobbe:resume-editor:value"

const initialResumeValue: Value = [
  {
    children: [{ text: "Jane Candidate" }],
    type: "h1",
  },
  {
    children: [
      {
        text: "Product-minded frontend engineer focused on ATS workflows, data-heavy tools, and practical automation.",
      },
    ],
    type: "p",
  },
  {
    children: [{ text: "Experience" }],
    type: "h2",
  },
  {
    children: [{ text: "Senior Frontend Engineer - Jobbe" }],
    type: "h3",
  },
  {
    children: [
      {
        text: "Built focused job search tooling with React, TypeScript, AG Grid, Supabase, and AI-assisted editing workflows.",
      },
    ],
    type: "p",
  },
  {
    children: [{ text: "Skills" }],
    type: "h2",
  },
  {
    children: [
      {
        text: "React, TypeScript, Vite, Supabase, AG Grid, OpenRouter, workflow automation, product systems.",
      },
    ],
    type: "p",
  },
]

// Text-align and line-height only target paragraphs by default, which is why
// alignment "only works on some text". Inject them into headings and quotes too.
const blockStyleTargets = [
  KEYS.p,
  KEYS.h1,
  KEYS.h2,
  KEYS.h3,
  KEYS.h4,
  KEYS.h5,
  KEYS.h6,
  KEYS.blockquote,
]

const editorPlugins = [
  BoldPlugin,
  ItalicPlugin,
  UnderlinePlugin,
  FontColorPlugin,
  FontBackgroundColorPlugin,
  FontSizePlugin,
  TextAlignPlugin.configure({ inject: { targetPlugins: blockStyleTargets } }),
  LineHeightPlugin.configure({ inject: { targetPlugins: blockStyleTargets } }),
  IndentPlugin,
  ListPlugin.configure({ render: { belowNodes: renderResumeListBelow } }),
  LinkPlugin,
  TogglePlugin.withComponent(ResumeToggleElement),
  HorizontalRulePlugin.withComponent(ResumeHorizontalRuleElement),
  H1Plugin.withComponent(ResumeHeadingOne),
  H2Plugin.withComponent(ResumeHeadingTwo),
  H3Plugin.withComponent(ResumeHeadingThree),
  H4Plugin.withComponent(ResumeHeadingFour),
  H5Plugin.withComponent(ResumeHeadingFive),
  H6Plugin.withComponent(ResumeHeadingSix),
  BlockquotePlugin.withComponent(ResumeBlockquote),
]

const blockOptions = [
  { label: "Paragraph", value: "p" },
  { label: "Heading 1", value: "h1" },
  { label: "Heading 2", value: "h2" },
  { label: "Heading 3", value: "h3" },
  { label: "Heading 4", value: "h4" },
  { label: "Heading 5", value: "h5" },
  { label: "Heading 6", value: "h6" },
  { label: "Quote", value: "blockquote" },
  { label: "Toggle list", value: "toggle" },
] as const

const lineHeightOptions = [
  { label: "1.15", value: 1.15 },
  { label: "1.3", value: 1.3 },
  { label: "1.42", value: 1.42 },
  { label: "1.6", value: 1.6 },
  { label: "2.0", value: 2 },
] as const

const alignOptions: Array<{ label: string; value: ResumeTextAlign }> = [
  { label: "Left", value: "left" },
  { label: "Center", value: "center" },
  { label: "Right", value: "right" },
  { label: "Justify", value: "justify" },
]

// Default point size each block renders at (kept in sync with resume.css). Used
// as the baseline for the font-size stepper so it adjusts from the size of the
// currently selected text rather than the last value used.
const FALLBACK_FONT_SIZE = 10
const blockFontSizeDefaults: Record<string, number> = {
  blockquote: 10,
  h1: 22,
  h2: 16,
  h3: 14,
  h4: 13,
  h5: 12,
  h6: 11,
  p: 10,
}

type OptionalEditorTransforms = {
  backgroundColor?: { addMark: (value: string) => void }
  color?: { addMark: (value: string) => void }
  fontSize?: { addMark: (value: string) => void }
  h4?: { toggle: () => void }
  h5?: { toggle: () => void }
  h6?: { toggle: () => void }
  lineHeight?: { setNodes: (value: number) => void }
  redo?: () => void
  textAlign?: { setNodes: (value: ResumeTextAlign) => void }
  undo?: () => void
}

const resumeSectionHeadings = new Set([
  "SUMMARY",
  "EXPERIENCE",
  "EDUCATION",
  "SKILLS",
  "PROJECTS",
  "CERTIFICATIONS",
])

const resumeExportStyles = `
body {
  font-family: Calibri, Arial, sans-serif;
  font-size: 10pt;
  line-height: 1.28;
  color: #000000;
}
p {
  margin: 0 0 4pt;
}
h1 {
  margin: 0 0 6pt;
  font-size: 22pt;
  font-weight: 600;
  line-height: 1.15;
  text-align: center;
}
.resume-contact {
  margin: 0 0 14pt;
  font-size: 9pt;
  text-align: center;
}
h2 {
  margin: 14pt 0 6pt;
  padding-bottom: 4pt;
  border-bottom: 1px solid #777777;
  font-size: 16pt;
  font-weight: 700;
  line-height: 1.2;
  text-transform: uppercase;
}
h3 {
  margin: 10pt 0 2pt;
  color: #1f4e79;
  font-size: 14pt;
  font-weight: 700;
  line-height: 1.25;
}
h4 {
  margin: 8pt 0 2pt;
  font-size: 13pt;
  font-weight: 700;
}
h5 {
  margin: 8pt 0 2pt;
  font-size: 12pt;
  font-weight: 700;
}
h6 {
  margin: 8pt 0 2pt;
  font-size: 11pt;
  font-weight: 700;
}
ul, ol {
  margin: 0 0 7pt;
  padding-left: 22pt;
}
li {
  margin: 1pt 0;
}
blockquote {
  margin: 8pt 0;
  padding-left: 9pt;
  border-left: 2pt solid #999999;
}
hr {
  height: 1px;
  margin: 5pt 0 12pt;
  border: 0;
  background: #777777;
}
`

function loadInitialValue() {
  const savedValue = window.localStorage.getItem(STORAGE_KEY)
  if (!savedValue) return initialResumeValue

  try {
    return JSON.parse(savedValue) as Value
  } catch {
    window.localStorage.removeItem(STORAGE_KEY)
    return initialResumeValue
  }
}

function ResumeHeadingOne(props: PlateElementProps) {
  return <PlateElement as="h1" className="resume-editor-heading-one" {...props} />
}

function ResumeHeadingTwo(props: PlateElementProps) {
  return <PlateElement as="h2" className="resume-editor-heading-two" {...props} />
}

function ResumeHeadingThree(props: PlateElementProps) {
  return (
    <PlateElement as="h3" className="resume-editor-heading-three" {...props} />
  )
}

function ResumeHeadingFour(props: PlateElementProps) {
  return <PlateElement as="h4" className="resume-editor-heading-four" {...props} />
}

function ResumeHeadingFive(props: PlateElementProps) {
  return <PlateElement as="h5" className="resume-editor-heading-five" {...props} />
}

function ResumeHeadingSix(props: PlateElementProps) {
  return <PlateElement as="h6" className="resume-editor-heading-six" {...props} />
}

function ResumeBlockquote(props: PlateElementProps) {
  return (
    <PlateElement as="blockquote" className="resume-editor-quote" {...props} />
  )
}

function ResumeToggleElement(props: PlateElementProps) {
  return <PlateElement as="div" className="resume-editor-toggle" {...props} />
}

function ResumeHorizontalRuleElement(props: PlateElementProps) {
  return (
    <PlateElement as="div" className="resume-editor-horizontal-rule" {...props}>
      <div
        className="resume-editor-horizontal-rule-line"
        contentEditable={false}
        role="separator"
      />
      {props.children}
    </PlateElement>
  )
}

type ResumeListElement = TElement & {
  checked?: boolean
  listStart?: number
  listStyleType?: string
}

// Renders todo list items as real checkboxes (Plate treats "todo" as an ordered
// list by default, which is why the To-do button produced numbers). Bulleted,
// numbered and alpha lists keep Plate's default ul/ol rendering.
function ResumeListWrapper(props: {
  children: React.ReactNode
  element: ResumeListElement
}) {
  const { children, element } = props
  const todoState = useTodoListElementState({ element })
  const { checkboxProps } = useTodoListElement(todoState)

  if (element.listStyleType === KEYS.listTodo) {
    return (
      <div className="resume-editor-todo">
        <span className="resume-editor-todo-marker" contentEditable={false}>
          <input
            checked={checkboxProps.checked}
            className="resume-editor-todo-checkbox"
            type="checkbox"
            onChange={(event) => checkboxProps.onCheckedChange(event.target.checked)}
            onMouseDown={checkboxProps.onMouseDown}
          />
        </span>
        <span
          className="resume-editor-todo-text"
          data-checked={checkboxProps.checked ? "true" : "false"}
        >
          {children}
        </span>
      </div>
    )
  }

  const ordered = isOrderedList(element)
  const ListTag = ordered ? "ol" : "ul"
  return (
    <ListTag
      start={ordered ? element.listStart : undefined}
      style={{
        listStyleType: element.listStyleType,
        margin: 0,
        padding: 0,
        position: "relative",
      }}
    >
      <li>{children}</li>
    </ListTag>
  )
}

// Plate invokes the returned function inline (not as JSX), so it must return an
// element via createElement rather than a component that runs hooks — otherwise
// ResumeListWrapper's hooks would leak into ElementContent's hook sequence.
// Keeping this an anonymous, lowercase, hook-free arrow also stops the React
// Compiler from injecting useMemoCache into it.
function renderResumeListBelow(props: { element: ResumeListElement }) {
  if (!props.element.listStyleType) return
  return (belowProps: { children: React.ReactNode; element: ResumeListElement }) =>
    createElement(ResumeListWrapper, {
      children: belowProps.children,
      element: belowProps.element,
    })
}

function getNodeText(node: unknown): string {
  if (!node || typeof node !== "object") return ""

  const record = node as { children?: unknown[]; text?: unknown }
  if (typeof record.text === "string") return record.text

  return record.children?.map(getNodeText).join("") ?? ""
}

function hasBoldText(node: unknown): boolean {
  if (!node || typeof node !== "object") return false

  const record = node as { bold?: unknown; children?: unknown[] }
  if (record.bold === true) return true

  return record.children?.some(hasBoldText) ?? false
}

function normalizeImportedResumeValue(nodes: Value): Value {
  let firstContentIndex = nodes.findIndex((node) => getNodeText(node).trim())
  if (firstContentIndex < 0) firstContentIndex = 0

  let contentIndex = 0

  return nodes.slice(firstContentIndex).map((node) => {
    const text = getNodeText(node).trim()
    if (!text) return node

    const upperText = text.toUpperCase()
    const isSectionHeading = resumeSectionHeadings.has(upperText)
    const importedNode = node as Record<string, unknown>

    if (contentIndex === 0) {
      contentIndex += 1
      return { ...importedNode, type: "h1" }
    }

    if (contentIndex === 1) {
      contentIndex += 1
      return { ...importedNode, type: "p" }
    }

    contentIndex += 1

    if (isSectionHeading) return { ...importedNode, type: "h2" }

    if (hasBoldText(node) && text.length <= 80) {
      return { ...importedNode, type: "h3" }
    }

    return node
  }) as Value
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function normalizeStyleValue(value: unknown) {
  return typeof value === "string" ? value : ""
}

function serializeInline(node: unknown): string {
  if (!node || typeof node !== "object") return ""

  const record = node as Record<string, unknown>
  if (typeof record.text === "string") {
    let html = escapeHtml(record.text)
    const styles = [
      normalizeStyleValue(record.color)
        ? `color: ${normalizeStyleValue(record.color)}`
        : "",
      normalizeStyleValue(record.backgroundColor)
        ? `background-color: ${normalizeStyleValue(record.backgroundColor)}`
        : "",
      normalizeStyleValue(record.fontSize)
        ? `font-size: ${normalizeStyleValue(record.fontSize)}`
        : "",
    ].filter(Boolean)

    if (record.bold === true) html = `<strong>${html}</strong>`
    if (record.italic === true) html = `<em>${html}</em>`
    if (record.underline === true) html = `<u>${html}</u>`
    if (styles.length) html = `<span style="${styles.join("; ")}">${html}</span>`

    return html
  }

  const children = Array.isArray(record.children) ? record.children : []
  return children.map(serializeInline).join("")
}

function getElementType(node: unknown) {
  if (!node || typeof node !== "object") return "p"
  const type = (node as Record<string, unknown>).type
  return typeof type === "string" ? type : "p"
}

function getTextAlign(node: unknown) {
  if (!node || typeof node !== "object") return ""
  const textAlign = (node as Record<string, unknown>).textAlign
  return typeof textAlign === "string" ? textAlign : ""
}

function getLineHeight(node: unknown) {
  if (!node || typeof node !== "object") return ""
  const lineHeight = (node as Record<string, unknown>).lineHeight
  return typeof lineHeight === "number" ? String(lineHeight) : ""
}

function getListStyleType(node: unknown) {
  if (!node || typeof node !== "object") return ""
  const listStyleType = (node as Record<string, unknown>).listStyleType
  return typeof listStyleType === "string" ? listStyleType : ""
}

function serializeBlock(node: unknown, className = "") {
  const type = getElementType(node)
  const content = serializeInline(node)
  const textAlign = getTextAlign(node)
  const lineHeight = getLineHeight(node)
  const styles = [
    textAlign ? `text-align: ${textAlign}` : "",
    lineHeight ? `line-height: ${lineHeight}` : "",
  ].filter(Boolean)
  const styleAttribute = styles.length ? ` style="${styles.join("; ")}"` : ""
  const classAttribute = className ? ` class="${className}"` : ""

  if (type === "hr") return "<hr />"
  if (/^h[1-6]$/.test(type)) {
    return `<${type}${styleAttribute}>${content}</${type}>`
  }
  if (type === "blockquote") {
    return `<blockquote${styleAttribute}>${content}</blockquote>`
  }

  return `<p${classAttribute}${styleAttribute}>${content || "<br />"}</p>`
}

function serializeResumeToHtml(nodes: Value) {
  let html = ""
  let openListType = ""
  let previousType = ""

  function closeList() {
    if (!openListType) return
    html += openListType === "disc" || openListType === "todo" ? "</ul>" : "</ol>"
    openListType = ""
  }

  for (const node of nodes) {
    const listStyleType = getListStyleType(node)

    if (listStyleType) {
      const tag = listStyleType === "disc" || listStyleType === "todo" ? "ul" : "ol"
      const listStyle =
        listStyleType === "lower-alpha"
          ? ' style="list-style-type: lower-alpha"'
          : ""

      if (openListType !== listStyleType) {
        closeList()
        html += `<${tag}${listStyle}>`
        openListType = listStyleType
      }

      html += `<li>${serializeInline(node) || "<br />"}</li>`
      previousType = "li"
      continue
    }

    closeList()

    const type = getElementType(node)
    const className = previousType === "h1" && type === "p" ? "resume-contact" : ""
    html += serializeBlock(node, className)
    previousType = type
  }

  closeList()
  return html
}

function wrapResumeHtmlForDocx(bodyHtml: string) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>
${resumeExportStyles}
    </style>
  </head>
  <body>
${bodyHtml}
  </body>
</html>`
}

function useResumeEditor() {
  return usePlateEditor({
    plugins: editorPlugins,
    value: loadInitialValue,
  })
}

type ResumeEditorInstance = ReturnType<typeof useResumeEditor>

// The formatting toolbar lives inside <Plate> so it can read the live selection
// (current block, font size, alignment) via useEditorSelector.
function ResumeToolbar({
  editor,
  settings,
  updateSettings,
}: {
  editor: ResumeEditorInstance
  settings: ResumeEditorSettings
  updateSettings: (next: Partial<ResumeEditorSettings>) => void
}) {
  const currentBlockType = useEditorSelector((editorRef) => {
    const entry = editorRef.api.block<TElement>()
    return (entry?.[0].type as string | undefined) ?? "p"
  }, [])

  const effectiveFontSize = useEditorSelector((editorRef) => {
    const marks = editorRef.api.marks() as { fontSize?: string } | null
    if (marks?.fontSize) {
      const parsed = Number.parseFloat(marks.fontSize)
      if (Number.isFinite(parsed)) return Math.round(parsed)
    }

    const entry = editorRef.api.block<TElement>()
    const type = (entry?.[0].type as string | undefined) ?? "p"
    return blockFontSizeDefaults[type] ?? FALLBACK_FONT_SIZE
  }, [])

  const currentAlign = useEditorSelector((editorRef) => {
    const entry = editorRef.api.block<TElement & { textAlign?: string }>()
    const align = entry?.[0].textAlign
    return align === "center" || align === "right" || align === "justify"
      ? align
      : "left"
  }, [])

  function transforms() {
    return editor.tf as typeof editor.tf & OptionalEditorTransforms
  }

  function handleBlockStyleChange(value: string) {
    if (value === "p") {
      editor.tf.toggleBlock("p")
      return
    }

    if (value === "h1") {
      editor.tf.h1.toggle()
      return
    }

    if (value === "h2") {
      editor.tf.h2.toggle()
      return
    }

    if (value === "h3") {
      editor.tf.h3.toggle()
      return
    }

    if (value === "h4") {
      transforms().h4?.toggle()
      return
    }

    if (value === "h5") {
      transforms().h5?.toggle()
      return
    }

    if (value === "h6") {
      transforms().h6?.toggle()
      return
    }

    if (value === "toggle") {
      editor.tf.toggleBlock("toggle")
      openNextToggles(editor as SlateEditor)
      return
    }

    if (value === "blockquote") {
      editor.tf.blockquote.toggle()
    }
  }

  function applyFontSizeBy(delta: number) {
    const next = Math.min(72, Math.max(6, effectiveFontSize + delta))
    updateSettings({ fontSize: next })
    transforms().fontSize?.addMark(`${next}pt`)
  }

  function applyTextColor(color: string) {
    updateSettings({ textColor: color })
    transforms().color?.addMark(color)
  }

  function applyBackgroundColor(color: string) {
    updateSettings({ backgroundColor: color })
    transforms().backgroundColor?.addMark(color)
  }

  function applyHighlightColor(color: string) {
    updateSettings({ highlightColor: color })
    transforms().backgroundColor?.addMark(color)
  }

  function applyLineHeight(lineHeight: number) {
    updateSettings({ lineHeight })
    transforms().lineHeight?.setNodes(lineHeight)
  }

  function applyAlign(align: ResumeTextAlign) {
    updateSettings({ align })
    transforms().textAlign?.setNodes(align)
  }

  function handleList(style: string) {
    toggleList(editor as SlateEditor, { listStyleType: style })
  }

  function handleTodoList() {
    toggleList(editor as SlateEditor, { listStyleType: KEYS.listTodo })
  }

  function handleInsertLink() {
    triggerFloatingLinkInsert(editor as SlateEditor, { focused: true })
  }

  function handleInsertHorizontalRule() {
    editor.tf.insertNodes({
      children: [{ text: "" }],
      type: "hr",
    })
  }

  return (
    <div className="resume-editor-toolbar" aria-label="Formatting tools">
      <div className="resume-editor-control-group">
        <select
          aria-label="Block type"
          className="resume-editor-select resume-editor-block-select"
          value={
            blockOptions.some((option) => option.value === currentBlockType)
              ? currentBlockType
              : "p"
          }
          onChange={(event) => handleBlockStyleChange(event.target.value)}
        >
          {blockOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="resume-editor-control-group">
        <ToolButton label="Undo" onClick={() => transforms().undo?.()}>
          <Undo2 aria-hidden="true" />
        </ToolButton>
        <ToolButton label="Redo" onClick={() => transforms().redo?.()}>
          <Redo2 aria-hidden="true" />
        </ToolButton>
      </div>

      <div className="resume-editor-control-group resume-editor-size-group">
        <ToolButton label="Decrease font size" onClick={() => applyFontSizeBy(-1)}>
          <Minus aria-hidden="true" />
        </ToolButton>
        <span className="resume-editor-size-value">{effectiveFontSize}</span>
        <ToolButton label="Increase font size" onClick={() => applyFontSizeBy(1)}>
          <Plus aria-hidden="true" />
        </ToolButton>
      </div>

      <div className="resume-editor-control-group">
        <ToolButton label="Bold" onClick={() => editor.tf.bold.toggle()}>
          <Bold aria-hidden="true" />
        </ToolButton>
        <ToolButton label="Italic" onClick={() => editor.tf.italic.toggle()}>
          <Italic aria-hidden="true" />
        </ToolButton>
        <ToolButton label="Underline" onClick={() => editor.tf.underline.toggle()}>
          <Underline aria-hidden="true" />
        </ToolButton>
      </div>

      <div className="resume-editor-control-group">
        <ColorControl
          label="Text"
          icon={<Palette aria-hidden="true" />}
          value={settings.textColor}
          onChange={applyTextColor}
        />
        <ColorControl
          label="Background"
          icon={<PaintBucket aria-hidden="true" />}
          value={settings.backgroundColor}
          onChange={applyBackgroundColor}
        />
        <ColorControl
          label="Highlight"
          icon={<Highlighter aria-hidden="true" />}
          value={settings.highlightColor}
          onChange={applyHighlightColor}
        />
      </div>

      <div className="resume-editor-control-group">
        <label className="resume-editor-icon-select" title="Line height">
          <Rows3 aria-hidden="true" />
          <select
            className="resume-editor-select resume-editor-compact-select"
            value={settings.lineHeight}
            onChange={(event) => applyLineHeight(Number(event.target.value))}
          >
            {lineHeightOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {alignOptions.map((option) => (
          <ToolButton
            key={option.value}
            active={currentAlign === option.value}
            label={`Align ${option.label.toLowerCase()}`}
            onClick={() => applyAlign(option.value)}
          >
            {option.value === "left" ? <AlignLeft aria-hidden="true" /> : null}
            {option.value === "center" ? <AlignCenter aria-hidden="true" /> : null}
            {option.value === "right" ? <AlignRight aria-hidden="true" /> : null}
            {option.value === "justify" ? <AlignJustify aria-hidden="true" /> : null}
          </ToolButton>
        ))}
      </div>

      <div className="resume-editor-control-group">
        <ToolButton label="Bullet list" onClick={() => handleList("disc")}>
          <List aria-hidden="true" />
        </ToolButton>
        <ToolButton label="Numbered list" onClick={() => handleList("decimal")}>
          <ListOrdered aria-hidden="true" />
        </ToolButton>
        <ToolButton label="Lettered list" onClick={() => handleList("lower-alpha")}>
          <ArrowDownAZ aria-hidden="true" />
        </ToolButton>
        <ToolButton label="To-do checklist" onClick={handleTodoList}>
          <ListChecks aria-hidden="true" />
        </ToolButton>
      </div>

      <div className="resume-editor-control-group">
        <ToolButton label="Outdent" onClick={() => outdentList(editor as SlateEditor)}>
          <IndentDecrease aria-hidden="true" />
        </ToolButton>
        <ToolButton label="Indent" onClick={() => indentList(editor as SlateEditor)}>
          <IndentIncrease aria-hidden="true" />
        </ToolButton>
      </div>

      <div className="resume-editor-control-group">
        <ToolButton
          label="Toggle list"
          onClick={() => handleBlockStyleChange("toggle")}
        >
          <ListCollapse aria-hidden="true" />
        </ToolButton>
        <ToolButton label="Link" onClick={handleInsertLink}>
          <Link2 aria-hidden="true" />
        </ToolButton>
        <ToolButton label="Horizontal rule" onClick={handleInsertHorizontalRule}>
          <SeparatorHorizontal aria-hidden="true" />
        </ToolButton>
      </div>
    </div>
  )
}

export function ResumeEditor() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const settingsSignatureRef = useRef("")
  const [settings, setSettings] = useState<ResumeEditorSettings>(
    defaultResumeEditorSettings,
  )
  const [settingsReady, setSettingsReady] = useState(false)

  const editor = useResumeEditor()

  useEffect(() => {
    let cancelled = false

    async function loadSettings() {
      const result = await fetchResumeEditorSettings()
      if (cancelled) return

      if (result.ok && result.data) {
        setSettings(result.data)
        settingsSignatureRef.current = JSON.stringify(result.data)
      } else if (result.ok) {
        settingsSignatureRef.current = JSON.stringify(defaultResumeEditorSettings)
      } else {
        console.error(`Resume settings unavailable: ${result.error}`)
      }

      setSettingsReady(true)
    }

    void loadSettings()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!settingsReady) return

    const signature = JSON.stringify(settings)
    if (signature === settingsSignatureRef.current) return

    const timeout = window.setTimeout(() => {
      void saveResumeEditorSettings(settings).then((result) => {
        if (result.ok) {
          settingsSignatureRef.current = JSON.stringify(result.data)
        } else {
          console.error(`Resume settings save failed: ${result.error}`)
        }
      })
    }, 500)

    return () => window.clearTimeout(timeout)
  }, [settings, settingsReady])

  function updateSettings(next: Partial<ResumeEditorSettings>) {
    setSettings((current) => ({ ...current, ...next }))
  }

  async function handleImportDocx(file: File | undefined) {
    if (!file) return

    try {
      const { importDocx } = await import("@platejs/docx-io")
      const arrayBuffer = await file.arrayBuffer()
      const result = await importDocx(editor, arrayBuffer)
      const normalizedNodes = normalizeImportedResumeValue(result.nodes as Value)
      editor.tf.setValue(normalizedNodes)
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedNodes))
    } catch (error) {
      console.error(error instanceof Error ? error.message : "DOCX import failed")
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  async function handleExportDocx() {
    try {
      const { downloadDocx, htmlToDocxBlob } = await import("@platejs/docx-io")
      const blob = await htmlToDocxBlob(wrapResumeHtmlForDocx(serializeResumeToHtml(editor.children)), {
        font: "Calibri",
        margins: {
          bottom: 1080,
          left: 1080,
          right: 1080,
          top: 1080,
        },
        orientation: "portrait",
        title: "Resume",
      })
      downloadDocx(blob, "resume.docx")
    } catch (error) {
      console.error(error instanceof Error ? error.message : "DOCX export failed")
    }
  }

  function handleReset() {
    editor.tf.setValue(initialResumeValue)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initialResumeValue))
  }

  return (
    <section className="resume-editor-page" aria-label="Resume editor">
      <Plate
        editor={editor}
        onChange={({ value }) => {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
        }}
      >
        <div className="resume-editor-workspace">
          <div className="resume-editor-side-space" aria-hidden="true" />
          <div className="resume-editor-shell">
            <div className="resume-editor-topbar">
              <ResumeToolbar
                editor={editor}
                settings={settings}
                updateSettings={updateSettings}
              />

              <div
                className="resume-editor-actions"
                aria-label="Resume document actions"
              >
                <input
                  ref={fileInputRef}
                  className="resume-editor-file-input"
                  type="file"
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(event) =>
                    void handleImportDocx(event.target.files?.[0])
                  }
                />
                <button
                  className="resume-editor-button"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload aria-hidden="true" />
                  Import Word
                </button>
                <button
                  className="resume-editor-button resume-editor-button-primary"
                  type="button"
                  onClick={() => void handleExportDocx()}
                >
                  <Download aria-hidden="true" />
                  Export Word
                </button>
                <button
                  className="resume-editor-button"
                  type="button"
                  onClick={handleReset}
                >
                  <RotateCcw aria-hidden="true" />
                  Reset
                </button>
              </div>
            </div>

            <div className="resume-editor-document-frame">
              <PlateContent
                className="resume-editor-document"
                placeholder="Draft your resume..."
              />
            </div>
          </div>
        </div>
      </Plate>
    </section>
  )
}

function ColorControl({
  icon,
  label,
  onChange,
  value,
}: {
  icon: React.ReactNode
  label: string
  onChange: (value: string) => void
  value: string
}) {
  return (
    <label className="resume-editor-color-control" title={`${label} color`}>
      {icon}
      <span className="resume-editor-visually-hidden">{label}</span>
      <span
        className="resume-editor-color-swatch"
        style={{ backgroundColor: value }}
      />
      <input
        aria-label={`${label} color`}
        className="resume-editor-color-input"
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function ToolButton({
  active = false,
  children,
  label,
  onClick,
}: {
  active?: boolean
  children: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      aria-label={label}
      className="resume-editor-tool"
      data-active={active ? "true" : "false"}
      title={label}
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
