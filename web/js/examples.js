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
};

export const DEFAULT_DIAGRAM = EXAMPLES.sequence;
