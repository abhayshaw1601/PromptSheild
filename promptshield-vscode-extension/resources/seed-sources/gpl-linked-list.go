// GPL-3.0 Licensed Sample: Linked List Operations
// SPDX-License-Identifier: GPL-3.0-only
//
// This program is free software: you can redistribute it
// and/or modify it under the terms of the GNU General Public License
// as published by the Free Software Foundation, version 3.
//
// Seed fingerprint source for PromptShield Bloom filter compiler.

package linkedlist

import "fmt"

type Node struct {
	Value int
	Next  *Node
}

type LinkedList struct {
	Head *Node
	Size int
}

func NewLinkedList() *LinkedList {
	return &LinkedList{Head: nil, Size: 0}
}

func (ll *LinkedList) InsertAtHead(value int) {
	newNode := &Node{Value: value, Next: ll.Head}
	ll.Head = newNode
	ll.Size++
}

func (ll *LinkedList) InsertAtTail(value int) {
	newNode := &Node{Value: value, Next: nil}

	if ll.Head == nil {
		ll.Head = newNode
		ll.Size++
		return
	}

	current := ll.Head
	for current.Next != nil {
		current = current.Next
	}

	current.Next = newNode
	ll.Size++
}

func (ll *LinkedList) DeleteByValue(value int) bool {
	if ll.Head == nil {
		return false
	}

	if ll.Head.Value == value {
		ll.Head = ll.Head.Next
		ll.Size--
		return true
	}

	current := ll.Head
	for current.Next != nil {
		if current.Next.Value == value {
			current.Next = current.Next.Next
			ll.Size--
			return true
		}
		current = current.Next
	}

	return false
}

func (ll *LinkedList) Search(value int) bool {
	current := ll.Head
	for current != nil {
		if current.Value == value {
			return true
		}
		current = current.Next
	}

	return false
}

func (ll *LinkedList) Reverse() {
	var prev *Node
	current := ll.Head

	for current != nil {
		next := current.Next
		current.Next = prev
		prev = current
		current = next
	}

	ll.Head = prev
}

func (ll *LinkedList) GetMiddle() (int, error) {
	if ll.Head == nil {
		return 0, fmt.Errorf("list is empty")
	}

	slow := ll.Head
	fast := ll.Head

	for fast != nil && fast.Next != nil {
		slow = slow.Next
		fast = fast.Next.Next
	}

	return slow.Value, nil
}

func (ll *LinkedList) HasCycle() bool {
	if ll.Head == nil {
		return false
	}

	slow := ll.Head
	fast := ll.Head

	for fast != nil && fast.Next != nil {
		slow = slow.Next
		fast = fast.Next.Next

		if slow == fast {
			return true
		}
	}

	return false
}

func (ll *LinkedList) RemoveDuplicates() {
	if ll.Head == nil {
		return
	}

	seen := make(map[int]bool)
	current := ll.Head
	seen[current.Value] = true
	var prev *Node = current

	current = current.Next
	for current != nil {
		if seen[current.Value] {
			prev.Next = current.Next
			ll.Size--
		} else {
			seen[current.Value] = true
			prev = current
		}
		current = current.Next
	}
}

func (ll *LinkedList) ToSlice() []int {
	result := make([]int, 0, ll.Size)
	current := ll.Head

	for current != nil {
		result = append(result, current.Value)
		current = current.Next
	}

	return result
}
