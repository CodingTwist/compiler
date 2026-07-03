Tried in dart using its AST but crashed and burned, needed a modern language to make it usable

got some basic code working but the split between AST and IR was not great

started to decouple it

pushed hard on using Classes and polymorphism to handle each node

A circular dependency was created since the handles were classes now and not static, I could not reference them from themselves. new Datapack -> new handlers(ALL THE HANDLES WITH DATAPACK REF) -> new FunctionGen(Handlers) -> (IF node handler(handler)), this is can't be called with a handlers array since it created before that is defined ->  new FunctionGen(*Handlers does not exist*)

This was solved using a Dispatcher + Emitter pattern. The dispatcher owns the traversal and the context is passed to each level. 