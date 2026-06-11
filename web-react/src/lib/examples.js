// Starter templates for the editor's "Insert example" menu.

export const EXAMPLES = {
  sequence: `@startuml
title Sequence Example
actor User
participant "Web App" as App
database DB

User -> App: Login(credentials)
App -> DB: Lookup user
DB --> App: User record
App --> User: Session token
@enduml`,

  component: `@startuml
title Component Example
package "Frontend" {
  [Editor]
  [Preview]
}
package "Services" {
  [PlantUML Server]
}
[Editor] --> [Preview]
[Preview] --> [PlantUML Server]
@enduml`,

  activity: `@startuml
title Activity Example
start
:Read diagram text;
if (Valid syntax?) then (yes)
  :Render image;
else (no)
  :Show error;
endif
stop
@enduml`,

  class: `@startuml
title Class Example
class Editor {
  +String text
  +render()
  +save()
}
class Preview {
  +update(url)
}
Editor "1" --> "1" Preview : drives
@enduml`,

  state: `@startuml
title State Example
[*] --> Idle
Idle --> Editing : type
Editing --> Rendering : debounce
Rendering --> Idle : done
Rendering --> Error : failure
Error --> Editing : fix
@enduml`,

  er: `@startuml
title ER Example
entity User {
  * id : int
  --
  name : text
  email : text
}
entity Session {
  * id : int
  --
  user_id : int
  token : text
}
User ||--o{ Session : has
@enduml`,

  usecase: `@startuml
title Use Case Example
left to right direction
actor User
actor Admin
rectangle Editor {
  User --> (Edit diagram)
  User --> (Render preview)
  Admin --> (Manage server)
  (Edit diagram) ..> (Validate) : include
}
@enduml`,

  object: `@startuml
title Object Example
object user1 {
  name = "Ada"
  role = "admin"
}
object session1 {
  token = "abc123"
  expires = "2026-01-01"
}
user1 --> session1 : owns
@enduml`,

  mindmap: `@startmindmap
* PlantUML Editor
** Editor
*** CodeMirror6
*** Live preview
** Agent
*** matrix-safe
*** Fix / Generate
** Convert
*** PlantUML <-> Mermaid
*** Type to type
@endmindmap`,

  // Mermaid-only types (rendered client-side via mermaid.js, not the PlantUML server).
  'pie (mermaid)': `pie title Diagram Sources
  "PlantUML" : 55
  "Mermaid" : 35
  "Other" : 10`,

  'journey (mermaid)': `journey
  title Editing a diagram
  section Author
    Type source: 5: User
    Render preview: 4: User
  section Fix
    Run agent: 3: User, Agent
    Apply result: 5: User`,

  'gitgraph (mermaid)': `gitGraph
  commit
  branch develop
  checkout develop
  commit
  commit
  checkout main
  merge develop
  commit`,
};

export const DEFAULT_DIAGRAM = EXAMPLES.sequence;
