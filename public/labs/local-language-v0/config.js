const WEBLLM = "https://esm.run/@mlc-ai/web-llm@0.2.85";
const VERSION = "local_language_v0";
const MODELS = [
  ["Llama-3.2-1B-Instruct-q4f16_1-MLC", "1B", 879.04, "Llama 3.2 Community", "Spanish supported"],
  ["Qwen2.5-1.5B-Instruct-q4f16_1-MLC", "1.5B", 1629.75, "Apache-2.0", "multilingual / Spanish"],
  ["SmolLM2-1.7B-Instruct-q4f16_1-MLC", "1.7B", 1774.19, "Apache-2.0", "English stress baseline"],
  ["Qwen2.5-3B-Instruct-q4f16_1-MLC", "3B", 2504.76, "Apache-2.0", "upper device tier"],
  ["Qwen2.5-0.5B-Instruct-q4f16_1-MLC", "0.5B", 944.62, "Apache-2.0", "lower-bound baseline"],
].map(([id, params, vramMb, license, note]) => ({ id, params, vramMb, license, note }));
const INTENTS = ["greeting","recommend_today","plan_week","training_trend","recovery_status","equipment_query","session_lookup","save_recommendation","move_plan","unavailability","adapt_environment","adapt_duration","cancel_plan","adapt_week","unknown"];
const ENVS = ["home","pool","trail","outdoor","functional_training_center"];
const DATES = ["today","tomorrow","yesterday","this_week","next_week","weekday"];
const DAYS = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
const empty = () => ({environment:null,duration_max_minutes:null,intensity_preference:null,date_reference:null,weekday:null});
const row = (language,text,intent,slots={}) => ({language,text,expected:{intent,language,slots:{...empty(),...slots}}});
function dataset(){
  const out=[]; const esEnv=["en casa","en la piscina","por trail","al aire libre","en el gimnasio"]; const enEnv=["at home","at the pool","on the trail","outdoors","at the gym"];
  const envKeys=ENVS, mins=[20,30,40,45,60], intensities=[["easy","suave","easy"],["moderate","moderado","moderate"],["hard","intenso","hard"]];
  for(const lang of ["es","en"]) for(let i=0;i<30;i++){ const j=i%5,[intensity,esI,enI]=intensities[(i*2)%3],duration=mins[(i*2+1)%5]; out.push(row(lang,lang==="es"?`Hazme un entreno ${esI} ${esEnv[j]}, tengo ${duration} minutos`:`Build me an ${enI} workout ${enEnv[j]}, I have ${duration} minutes`,"recommend_today",{environment:envKeys[j],duration_max_minutes:duration,intensity_preference:intensity})); }
  [
    ["es","¿Qué entreno hoy?","recommend_today",{date_reference:"today"}],["en","What should I train today?","recommend_today",{date_reference:"today"}],
    ["es","¿Qué me queda esta semana?","plan_week",{date_reference:"this_week"}],["en","What is left this week?","plan_week",{date_reference:"this_week"}],
    ["es","¿Estoy mejorando?","training_trend",{}],["en","Am I improving?","training_trend",{}],
    ["es","¿Cómo estoy de recuperación y HRV?","recovery_status",{}],["en","How is my recovery and HRV?","recovery_status",{}],
    ["es","¿Qué material tengo en casa?","equipment_query",{environment:"home"}],["en","What equipment do I have at home?","equipment_query",{environment:"home"}],
    ["es","¿Qué hice ayer?","session_lookup",{date_reference:"yesterday"}],["en","What did I do yesterday?","session_lookup",{date_reference:"yesterday"}],
    ["es","Apúntamelo","save_recommendation",{}],["en","Save it to the plan","save_recommendation",{}],
    ["es","Muévelo al viernes","move_plan",{date_reference:"weekday",weekday:"friday"}],["en","Move it to Friday","move_plan",{date_reference:"weekday",weekday:"friday"}],
    ["es","Mañana no puedo","unavailability",{date_reference:"tomorrow"}],["en","I can't train tomorrow","unavailability",{date_reference:"tomorrow"}],
    ["es","Hazlo en casa","adapt_environment",{environment:"home"}],["en","Do it at home","adapt_environment",{environment:"home"}],
    ["es","Hazlo de 30 minutos","adapt_duration",{duration_max_minutes:30}],["en","Make it 30 minutes","adapt_duration",{duration_max_minutes:30}],
    ["es","Cancela el entrenamiento del viernes","cancel_plan",{date_reference:"weekday",weekday:"friday"}],["en","Cancel Friday's workout","cancel_plan",{date_reference:"weekday",weekday:"friday"}],
    ["es","Adapta el resto de la semana","adapt_week",{date_reference:"this_week"}],["en","Adapt the rest of the week","adapt_week",{date_reference:"this_week"}],
    ["es","¿Qué entrenamientos tengo la semana que viene?","unknown",{date_reference:"next_week"}],["en","What workouts do I have next week?","unknown",{date_reference:"next_week"}],
  ].forEach(([l,t,i,s])=>out.push(row(l,t,i,s))); return out;
}
const schema={type:"object",additionalProperties:false,required:["version","intent","slots","language","confidence"],properties:{version:{const:VERSION},intent:{enum:INTENTS},language:{enum:["es","en","unknown"]},confidence:{type:"number",minimum:0,maximum:1},slots:{type:"object",additionalProperties:false,required:["environment","duration_max_minutes","intensity_preference","date_reference","weekday"],properties:{environment:{anyOf:[{type:"null"},{enum:ENVS}]},duration_max_minutes:{anyOf:[{type:"null"},{type:"integer",minimum:5,maximum:300}]},intensity_preference:{anyOf:[{type:"null"},{enum:["easy","moderate","hard"]}]},date_reference:{anyOf:[{type:"null"},{enum:DATES}]},weekday:{anyOf:[{type:"null"},{enum:DAYS}]}}}}};
const prompt="You are ENQIDU's language parser, not a sports coach. Return only JSON matching the schema. Classify intent and extract only explicit slots. Never recommend training, infer health data, or execute actions. Use unknown when semantics are outside the intent list.";

export { WEBLLM, VERSION, MODELS, schema, prompt, dataset };
