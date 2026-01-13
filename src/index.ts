import survey from "survey-core";

async function main() {
//   console.info("Starting the application...");




  const config = {
"pages": [
{
"name": "page1",
"elements": [
{
"type": "text",
"name": "question1"
},
{
"type": "text",
"name": "question2"
}
]
}
],
"headerView": "advanced"
};

  const model = new survey.SurveyModel(config)
}

main();