import OpenAI from 'openai'

const ai = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
})

export async function getFeedback(
  questionText: string,
  correctAnswer: string,
  answerGiven: string,
  isCorrect: boolean
): Promise<string> {
  const res = await ai.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      {
        role: 'system',
        content: 'You are a supportive study tutor. Respond with plain text only — no markdown, no bullet points.',
      },
      {
        role: 'user',
        content: `A student answered a study question.
Question: ${questionText}
Correct answer: ${correctAnswer}
Student's answer: ${answerGiven}
Result: ${isCorrect ? 'correct' : 'incorrect'}

In 2-3 sentences, explain why the correct answer is right. If the student was wrong, address their specific misconception without being discouraging.`,
      },
    ],
    temperature: 0.5,
  })
  return res.choices[0].message.content ?? ''
}
