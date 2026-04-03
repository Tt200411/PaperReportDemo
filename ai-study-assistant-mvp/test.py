import os
from openai import OpenAI

client = OpenAI(
    # 各地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
    # xx"若没有配置环境变量，请用阿里云百炼API Key将下行替换为：api_key="sk-x,
    # api_key=os.getenv("DASHSCOPE_API_KEY"),
    api_key="sk-2ca5afeaa2ec4ebbbff34a15e86731b3",
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
)
completion = client.chat.completions.create(
    model="qwen3.5-plus-2026-02-15",
    messages=[
        {'role': 'system', 'content': 'You are a helpful assistant.'},
        {'role': 'user', 'content': '请编写一个Python函数 find_prime_numbers，该函数接受一个整数 n 作为参数，并返回一个包含所有小于 n 的质数（素数）的列表。不要输出非代码的内容和Markdown的代码块。'}],
)
print(completion.choices[0].message.content)
