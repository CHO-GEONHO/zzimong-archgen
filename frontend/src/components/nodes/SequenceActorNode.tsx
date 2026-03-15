import { Handle, Position } from 'reactflow'

interface SequenceActorData {
  label: string
  iconUrl?: string | null
  totalMessages: number
  messageSpacing: number
}

export default function SequenceActorNode({ data }: { data: SequenceActorData }) {
  const lifelineHeight = 40 + data.totalMessages * data.messageSpacing + 40

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
      <Handle type="source" position={Position.Bottom} id="bottom-s" style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Bottom} id="bottom-t" style={{ opacity: 0 }} />

      {/* Actor box */}
      <div className="seq-actor-box">
        {data.iconUrl && (
          <img src={data.iconUrl} width={28} height={28} style={{ objectFit: 'contain' }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        )}
        <span className="seq-actor-label">{data.label}</span>
      </div>

      {/* Lifeline dashed line */}
      <div
        className="seq-lifeline"
        style={{ height: lifelineHeight }}
      />
    </div>
  )
}
