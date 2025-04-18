import {parseSync} from "@babel/core"
import _traverse from "@babel/traverse"
import {generate} from "@babel/generator"
import type {Node, MemberExpression, Identifier, StringLiteral} from "@babel/types"

// see https://github.com/babel/babel/issues/13855
const traverse = _traverse.default

function isIdentifier(
	node: Node,
	identifier: string
): node is Identifier {
	if (node.type !== "Identifier") {
		return false
	}

	return node.name === identifier
}

function isStringLiteral(
	node: Node,
	value: string
): node is StringLiteral {
	if (node.type !== "StringLiteral") {
		return false
	}

	return node.value === value
}

function isMemberExpression(
	node: Node,
	objectIdentifier: string,
	propertyIdentifier: string
): node is MemberExpression {
	if (node.type !== "MemberExpression") {
		return false
	} else if (node.object.type !== "Identifier") {
		return false
	} else if (node.property.type !== "Identifier") {
		return false
	} else if (node.object.name !== objectIdentifier) {
		return false
	}

	return node.property.name === propertyIdentifier
}

export function getAndRemoveEnkoreJSRuntimeGlobalProjectEmbedMapsStringFromCode(
	symbolForIdentifier: string,
	initMethodName: string,
	code: string
): {
	code: string
	globalProjectEmbedMaps: string[]
} {
	const globalProjectEmbedMaps: string[] = []

	const ast = parseSync(code, {
		sourceType: "module"
	})!

	traverse(ast, {
		AssignmentExpression(path) {
			if (!isMemberExpression(path.node.left, "globalThis", initMethodName)) {
				return
			}

			path.remove()
		},

		CallExpression(path) {
			if (!isMemberExpression(path.node.callee, "Object", "defineProperty")) {
				return
			} else if (path.node.arguments.length !== 3) {
				return
			} else if (!isIdentifier(path.node.arguments[0], "globalThis")) {
				return
			} else if (path.node.arguments[1].type !== "CallExpression") {
				return
			} else if (!isMemberExpression(path.node.arguments[1].callee, "Symbol", "for")) {
				return
			} else if (path.node.arguments[1].arguments.length !== 1) {
				return
			} else if (!isStringLiteral(path.node.arguments[1].arguments[0], symbolForIdentifier)) {
				return
			} else if (path.node.arguments[2].type !== "ObjectExpression") {
				return
			}

			let pushedValues: number = 0

			for (const prop of path.node.arguments[2].properties) {
				if (prop.type !== "ObjectProperty") continue
				if (prop.key.type !== "Identifier") continue
				if (prop.key.name !== "value") continue
				if (prop.value.type !== "CallExpression") continue

				const callExpr = prop.value

				if (!isMemberExpression(callExpr.callee, "globalThis", initMethodName)) {
					continue
				}

				if (callExpr.arguments.length !== 1) continue
				if (callExpr.arguments[0].type !== "CallExpression") continue

				if (!isMemberExpression(callExpr.arguments[0].callee, "JSON", "parse")) {
					continue
				}

				if (callExpr.arguments[0].arguments.length !== 1) continue
				if (callExpr.arguments[0].arguments[0].type !== "StringLiteral") continue

				globalProjectEmbedMaps.push(callExpr.arguments[0].arguments[0].value)

				pushedValues++;
			}

			if (pushedValues !== 1) {
				throw new Error(`Should not be able to get here! Means call to Object.defineProperty is wrong.`)
			}

			path.remove()
		}
	})

	return {
		code: generate(ast).code,
		globalProjectEmbedMaps
	}
}
