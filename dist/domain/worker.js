import { analyze } from "./engine.js";
self.onmessage = ({data}) => {
  try { self.postMessage({result:analyze(data)}); }
  catch (error) { self.postMessage({error:error.message}); }
};
