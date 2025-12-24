import { tool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * Calculator Tool - Performs mathematical calculations
 */
export const calculatorTool = tool(
  async ({ expression }) => {
    try {
      // Safe evaluation of mathematical expressions
      const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, "");
      const result = Function(`"use strict"; return (${sanitized})`)();
      return `The result of ${expression} is ${result}`;
    } catch (error) {
      return `Error calculating "${expression}": ${error.message}`;
    }
  },
  {
    name: "calculator",
    description:
      "Useful for performing mathematical calculations. Input should be a valid mathematical expression like '2 + 2' or '(10 * 5) / 2'",
    schema: z.object({
      expression: z
        .string()
        .describe("The mathematical expression to evaluate"),
    }),
  }
);

/**
 * Current Time Tool - Returns the current date and time
 */
export const currentTimeTool = tool(
  async ({ timezone }) => {
    const now = new Date();
    const options = {
      timeZone: timezone || "UTC",
      dateStyle: "full",
      timeStyle: "long",
    };
    try {
      return `Current date and time: ${now.toLocaleString("en-US", options)}`;
    } catch {
      return `Current date and time (UTC): ${now.toUTCString()}`;
    }
  },
  {
    name: "current_time",
    description:
      "Returns the current date and time. Optionally specify a timezone like 'America/New_York' or 'Europe/London'",
    schema: z.object({
      timezone: z
        .string()
        .optional()
        .describe("The timezone to use (e.g., 'America/New_York', 'UTC')"),
    }),
  }
);

/**
 * Random Number Generator Tool
 */
export const randomNumberTool = tool(
  async ({ min, max }) => {
    const minNum = min || 1;
    const maxNum = max || 100;
    const result = Math.floor(Math.random() * (maxNum - minNum + 1)) + minNum;
    return `Random number between ${minNum} and ${maxNum}: ${result}`;
  },
  {
    name: "random_number",
    description: "Generates a random number between min and max (inclusive)",
    schema: z.object({
      min: z.number().optional().describe("Minimum value (default: 1)"),
      max: z.number().optional().describe("Maximum value (default: 100)"),
    }),
  }
);

/**
 * String Utilities Tool
 */
export const stringUtilsTool = tool(
  async ({ text, operation }) => {
    switch (operation) {
      case "uppercase":
        return text.toUpperCase();
      case "lowercase":
        return text.toLowerCase();
      case "reverse":
        return text.split("").reverse().join("");
      case "length":
        return `Length: ${text.length} characters`;
      case "wordcount":
        return `Word count: ${text.split(/\s+/).filter(Boolean).length} words`;
      default:
        return `Unknown operation: ${operation}`;
    }
  },
  {
    name: "string_utils",
    description:
      "Performs string operations: uppercase, lowercase, reverse, length, wordcount",
    schema: z.object({
      text: z.string().describe("The text to process"),
      operation: z
        .enum(["uppercase", "lowercase", "reverse", "length", "wordcount"])
        .describe("The operation to perform"),
    }),
  }
);

/**
 * JSON Parser Tool - Parses and formats JSON
 */
export const jsonParserTool = tool(
  async ({ json, operation }) => {
    try {
      const parsed = JSON.parse(json);
      switch (operation) {
        case "format":
          return JSON.stringify(parsed, null, 2);
        case "keys":
          return `Keys: ${Object.keys(parsed).join(", ")}`;
        case "values":
          return `Values: ${Object.values(parsed).join(", ")}`;
        default:
          return JSON.stringify(parsed, null, 2);
      }
    } catch (error) {
      return `Error parsing JSON: ${error.message}`;
    }
  },
  {
    name: "json_parser",
    description: "Parses JSON and can format it, extract keys, or extract values",
    schema: z.object({
      json: z.string().describe("The JSON string to parse"),
      operation: z
        .enum(["format", "keys", "values"])
        .optional()
        .describe("Operation to perform (default: format)"),
    }),
  }
);

// Export all tools as an array
export const allTools = [
  calculatorTool,
  currentTimeTool,
  randomNumberTool,
  stringUtilsTool,
  jsonParserTool,
];

