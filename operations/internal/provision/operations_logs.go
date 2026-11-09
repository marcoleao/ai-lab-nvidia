package provision

import (
	"bytes"
	"context"
	"io"
	"os"
	"path/filepath"
)

type logExportIntent struct {
	Component, ContainerID, RequestID string
	Tail                              int
	Capture                           *LogExport
}

func (e *Engine) exportOperationLogs(ctx context.Context, p OperationOptions, r *OperationResult, s operationSnapshot) (finalErr error) {
	service := s.services[p.Component]
	if !s.runtime || !service.observation.Owned || service.container == nil {
		return codedError("PLATFORM_OPERATION_RESOURCE_NOT_CONFIRMED")
	}
	id := p.RequestID
	var err error
	if id == "" {
		id, err = randomIdentity()
		if err != nil {
			return err
		}
	}
	p.MaintenanceID = id
	r.MaintenanceID = id
	base := filepath.Join(p.ControlRoot, "exports")
	payload := filepath.Join(base, id+".log")
	receipt := filepath.Join(base, id+".json")
	intentPath := filepath.Join(base, id+".intent.json")
	for _, path := range []string{base, payload, receipt, intentPath} {
		if err = plain(path); err != nil {
			return err
		}
	}
	var exported LogExport
	receiptErr := accessPrivateRead(p.Options, filepath.Join("exports", id+".json"), &exported)
	if receiptErr != nil && !os.IsNotExist(receiptErr) {
		return receiptErr
	}
	before := "ABSENT"
	if receiptErr == nil {
		if !validOperationExport(exported, p, id, service.observation.ID) {
			return codedError("PLATFORM_LOG_EXPORT_REQUEST_CONFLICT")
		}
		data, err := readOperationLog(payload)
		if err != nil {
			return err
		}
		if digest(data) != exported.SHA256 || len(data) != exported.CapturedBytes {
			return codedError("PLATFORM_LOG_EXPORT_CONTENT_CHANGED")
		}
		before = digest(jsonBytes(exported))
	}
	audit := recorder{p.ControlRoot, p.Options, e.Host, e.Now}
	step := Step{"PLATFORM_PRIVATE_LOGS_EXPORTED", "ACCEPTED", "REQUESTED", before, "NOT_OBSERVED", "PRIVATE_BOUNDED_EXPORT_REQUESTED"}
	if err = audit.append(step); err != nil {
		return err
	}
	r.effectsStarted = true
	defer func() {
		if finalErr != nil {
			audit.diagnostic(step.Action, finalErr)
			step.Outcome, step.Phase, step.After, step.Reason = "UNKNOWN", "OBSERVED", "NOT_CONFIRMED", code(finalErr)
			if err := audit.append(step); err != nil {
				finalErr = err
			}
		}
	}()
	if receiptErr == nil {
		step.Outcome, step.Phase, step.After, step.Reason = "NO_CHANGE", "COMPLETED", before, "PRIVATE_EXPORT_REPLAY"
		if err = audit.append(step); err != nil {
			return err
		}
		r.Export = &exported
		r.Outcome = "NO_CHANGE"
		return nil
	}
	if err = ownedDirectory(base, p.InstallationID+":"+p.Profile+":"+digest([]byte(p.ControlRoot))+":private-exports"); err != nil {
		return err
	}
	intent := logExportIntent{}
	intentErr := accessPrivateRead(p.Options, filepath.Join("exports", id+".intent.json"), &intent)
	if intentErr != nil && !os.IsNotExist(intentErr) {
		return intentErr
	}
	if intentErr == nil && (intent.Component != p.Component || intent.ContainerID != service.observation.ID || intent.Tail != p.Tail || intent.RequestID != id) {
		return codedError("PLATFORM_LOG_EXPORT_REQUEST_CONFLICT")
	}
	if os.IsNotExist(intentErr) {
		intent = logExportIntent{Component: p.Component, ContainerID: service.observation.ID, RequestID: id, Tail: p.Tail}
		if err = atomicFile(intentPath, jsonBytes(intent), 0600); err != nil {
			return err
		}
	}
	data, readErr := readOperationLog(payload)
	if readErr == nil {
		if intent.Capture == nil || !validOperationExport(*intent.Capture, p, id, service.observation.ID) || digest(data) != intent.Capture.SHA256 || len(data) != intent.Capture.CapturedBytes {
			return codedError("PLATFORM_LOG_EXPORT_CONTENT_CHANGED")
		}
		exported = *intent.Capture
	} else if !os.IsNotExist(readErr) {
		return readErr
	} else {
		if _, err = e.operationService(ctx, p.Options, p.Component, service.observation.ID); err != nil {
			return err
		}
		response, err := e.docker(ctx, p.Options, "container", "logs", "--timestamps", "--tail", itoa(p.Tail), service.observation.ID)
		if err != nil {
			audit.diagnostic(step.Action, err)
			return err
		}
		data = []byte(response.Output)
		truncated := response.Truncated
		if len(data) > 262144 {
			data = data[:262144]
			truncated = true
		}
		exported = LogExport{RequestID: id, Component: p.Component, ContainerID: service.observation.ID, RelativePath: filepath.ToSlash(filepath.Join("exports", id+".log")), SHA256: digest(data), CapturedBytes: len(data), ByteLimit: 262144, TailRequested: p.Tail, Truncated: truncated, Completeness: "BOUNDED_WINDOW_NOT_FULL_HISTORY"}
		intent.Capture = &exported
		if err = atomicFile(intentPath, jsonBytes(intent), 0600); err != nil {
			return err
		}
		if err = atomicFile(payload, data, 0600); err != nil {
			return err
		}
	}
	if err = atomicFile(receipt, jsonBytes(exported), 0600); err != nil {
		return err
	}
	observed, err := readOperationLog(payload)
	if err != nil || !bytes.Equal(observed, data) {
		return codedError("PLATFORM_LOG_EXPORT_CONTENT_UNCONFIRMED")
	}
	step.Outcome, step.Phase, step.After, step.Reason = "SUCCEEDED", "COMPLETED", digest(jsonBytes(exported)), "PRIVATE_BOUNDED_EXPORT_OBSERVED"
	if err = audit.append(step); err != nil {
		return err
	}
	if err = os.Remove(intentPath); err != nil && !os.IsNotExist(err) {
		return err
	}
	r.Export = &exported
	return nil
}

func validOperationExport(v LogExport, p OperationOptions, id, containerID string) bool {
	return v.RequestID == id && v.Component == p.Component && v.ContainerID == containerID && v.TailRequested == p.Tail && v.RelativePath == filepath.ToSlash(filepath.Join("exports", id+".log")) && v.ByteLimit == 262144 && v.CapturedBytes >= 0 && v.CapturedBytes <= v.ByteLimit && hashPattern.MatchString(v.SHA256) && v.Completeness == "BOUNDED_WINDOW_NOT_FULL_HISTORY"
}

func readOperationLog(path string) ([]byte, error) {
	if err := plain(path); err != nil {
		return nil, err
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	if err = regularSingleLink(f); err != nil {
		return nil, err
	}
	data, err := io.ReadAll(io.LimitReader(f, 262145))
	if err == nil && len(data) > 262144 {
		return nil, codedError("PLATFORM_LOG_EXPORT_CONTENT_CHANGED")
	}
	return data, err
}
