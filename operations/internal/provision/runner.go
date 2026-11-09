package provision

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"sort"
	"strings"
)

type systemRunner struct{}
type boundedBuffer struct {
	bytes.Buffer
	truncated bool
}

func (b *boundedBuffer) Write(p []byte) (int, error) {
	n := len(p)
	if n > 262144-b.Len() {
		b.truncated = true
	}
	if b.Len() < 262144 {
		remaining := 262144 - b.Len()
		if len(p) > remaining {
			p = p[:remaining]
		}
		_, _ = b.Buffer.Write(p)
	}
	return n, nil
}
func (systemRunner) Run(ctx context.Context, c Command) (Response, error) {
	cmd := exec.CommandContext(ctx, c.Program, c.Args...)
	cmd.Env = os.Environ()
	keys := make([]string, 0, len(c.Env))
	for key := range c.Env {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		prefix := key + "="
		filtered := cmd.Env[:0]
		for _, v := range cmd.Env {
			if !strings.HasPrefix(v, prefix) {
				filtered = append(filtered, v)
			}
		}
		cmd.Env = append(filtered, prefix+c.Env[key])
	}
	var output boundedBuffer
	cmd.Stdout = &output
	cmd.Stderr = &output
	if c.Stdin != nil {
		cmd.Stdin = bytes.NewReader(c.Stdin)
	}
	err := cmd.Run()
	response := Response{Output: output.String(), Truncated: output.truncated}
	if err != nil {
		if exit, ok := err.(*exec.ExitError); ok {
			response.ExitCode = exit.ExitCode()
			return response, nil
		}
		return response, err
	}
	return response, nil
}
func (e *Engine) command(ctx context.Context, c Command) (Response, error) {
	r, err := e.Runner.Run(ctx, c)
	if err != nil {
		return r, fmt.Errorf("%w: %v", codedError("PLATFORM_PROVIDER_UNAVAILABLE"), err)
	}
	if r.ExitCode != 0 {
		return r, fmt.Errorf("%w: exit=%d %s", codedError("PLATFORM_COMMAND_FAILED"), r.ExitCode, r.Output)
	}
	return r, nil
}
