/**
 * GPL-3.0 Licensed Sample: Binary Tree Operations
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This file is free software: you can redistribute it
 * and/or modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation, version 3.
 *
 * This is a seed fingerprint source for PromptShield's Bloom filter compiler.
 * The structural AST pattern of this code will be indexed so that AI-generated
 * copies of this logic can be detected even if variable names are changed.
 */

function createNode(value) {
  return { value: value, left: null, right: null };
}

function insertNode(root, value) {
  if (root === null) {
    return createNode(value);
  }

  if (value < root.value) {
    root.left = insertNode(root.left, value);
  } else if (value > root.value) {
    root.right = insertNode(root.right, value);
  }

  return root;
}

function searchNode(root, target) {
  if (root === null) {
    return false;
  }

  if (target === root.value) {
    return true;
  }

  if (target < root.value) {
    return searchNode(root.left, target);
  }

  return searchNode(root.right, target);
}

function inorderTraversal(root, result) {
  if (root === null) {
    return;
  }

  inorderTraversal(root.left, result);
  result.push(root.value);
  inorderTraversal(root.right, result);
}

function findMinimum(root) {
  if (root === null) {
    throw new Error("Tree is empty");
  }

  let current = root;
  while (current.left !== null) {
    current = current.left;
  }

  return current.value;
}

function findMaximum(root) {
  if (root === null) {
    throw new Error("Tree is empty");
  }

  let current = root;
  while (current.right !== null) {
    current = current.right;
  }

  return current.value;
}

function deleteNode(root, target) {
  if (root === null) {
    return null;
  }

  if (target < root.value) {
    root.left = deleteNode(root.left, target);
    return root;
  }

  if (target > root.value) {
    root.right = deleteNode(root.right, target);
    return root;
  }

  if (root.left === null) {
    return root.right;
  }

  if (root.right === null) {
    return root.left;
  }

  let successor = root.right;
  while (successor.left !== null) {
    successor = successor.left;
  }

  root.value = successor.value;
  root.right = deleteNode(root.right, successor.value);
  return root;
}

function countNodes(root) {
  if (root === null) {
    return 0;
  }

  return 1 + countNodes(root.left) + countNodes(root.right);
}

function treeHeight(root) {
  if (root === null) {
    return 0;
  }

  const leftHeight = treeHeight(root.left);
  const rightHeight = treeHeight(root.right);

  return 1 + Math.max(leftHeight, rightHeight);
}

module.exports = {
  createNode,
  insertNode,
  searchNode,
  inorderTraversal,
  findMinimum,
  findMaximum,
  deleteNode,
  countNodes,
  treeHeight
};
