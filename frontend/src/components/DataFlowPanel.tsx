import { useState } from 'react'
import type { ArchIR } from '../App'

interface Props {
  ir: ArchIR
}

export default function DataFlowPanel({ ir }: Props) {
  const [collapsed, setCollapsed] = useState(true)

  if (!ir.data_flow || ir.data_flow.length === 0) return null

  return (
    <div className={`dataflow-panel${collapsed ? ' dataflow-collapsed' : ''}`}>
      <div className="dataflow-header" onClick={() => setCollapsed(c => !c)}>
        <div className="dataflow-header-left">
          <span className="dataflow-icon">⚡</span>
          <span className="dataflow-title">데이터 흐름</span>
          <span className="dataflow-count">{ir.data_flow.length}단계</span>
        </div>
        <div className="dataflow-header-right">
          <span className="dataflow-meta">{ir.meta.title}</span>
          <span className="dataflow-chevron">{collapsed ? '▲' : '▼'}</span>
        </div>
      </div>

      {!collapsed && (
        <div className="dataflow-steps">
          {ir.data_flow.map((step, i) => {
            const match = step.match(/^(\d+)\.\s*(.+)/)
            const num = match ? match[1] : String(i + 1)
            const text = match ? match[2] : step
            const isLast = i === ir.data_flow.length - 1

            return (
              <div key={i} className={`dataflow-step${isLast ? ' last' : ''}`}>
                <div className="dataflow-step-marker">
                  <span className="dataflow-step-num">{num}</span>
                  {!isLast && <div className="dataflow-step-line" />}
                </div>
                <span className="dataflow-step-text">{text}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
